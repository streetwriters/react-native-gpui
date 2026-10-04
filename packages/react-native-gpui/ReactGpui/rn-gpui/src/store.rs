//! The window-side view store (design doc §18.12).
//!
//! `ViewStore` owns the per-surface view trees and the React host. Fabric's
//! mount batches arrive on the JS thread and are forwarded to this store on the
//! main thread, where they are applied to GPUI entities.
//!
//! Mount operations are applied to `RNNodeView`s in the `SurfaceRootView` for
//! each React Native surface.

use crate::frame::FrameHook;
use crate::host::Host;
use crate::node_view::{
    screen_transition_mode, RNNodeView, ScreenTransition, ScreenTransitionRole,
};
#[cfg(target_os = "macos")]
use gpui::deferred;
use gpui::{
    div, point, prelude::*, px, AnyWindowHandle, App, Context, Entity, Global, IntoElement,
    MouseButton, NavigationDirection, Pixels, Point, Subscription, Window,
};
use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

pub(crate) fn benchmark_mode() -> Option<&'static str> {
    static MODE: OnceLock<Option<String>> = OnceLock::new();
    MODE.get_or_init(|| std::env::var("RN_GPUI_BENCH_MODE").ok())
        .as_deref()
}

fn unsupported_screens_component(name: &str) -> bool {
    matches!(
        name,
        "RNSSearchBar"
            | "RNSBottomTabs"
            | "RNSBottomTabsScreen"
            | "RNSScreenFooter"
            | "RNSSplitView"
            | "RNSSplitViewScreen"
    ) || name.starts_with("RNSSplitView")
}

/// Surface id of the app surface the window shows (TODO 2.6: every other
/// surface — currently only LogBox — is painted as an overlay above it).
pub const APP_SURFACE_ID: i32 = 1;

pub struct StoreGlobal(pub Entity<ViewStore>);
impl Global for StoreGlobal {}

pub struct ViewStore {
    pub host: Host,
    /// TODO 2.3 — the per-frame `on_render()` chain (see `frame.rs`). Kept by
    /// the store so mount batches and native events can extend its activity
    /// window while the chain itself lives in the window's frame callbacks.
    pub frame_hook: FrameHook,
    pub window: AnyWindowHandle,
    /// Fabric tag -> node view. One map per window: Fabric tags are unique
    /// across surfaces of the same React instance.
    pub nodes: HashMap<i32, Entity<RNNodeView>>,
    pub(crate) accessibility_modal_tags: BTreeSet<i32>,
    /// Surface id -> the window's root view for that surface.
    pub roots: HashMap<i32, Entity<SurfaceRootView>>,
    /// TODO 2.6 — the surface the window shows ([`APP_SURFACE_ID`]). Roots of
    /// any other surface are registered with [`ViewStore::overlay_host`], so
    /// LogBox paints on top of the app instead of replacing it.
    pub primary_surface_id: i32,
    /// TODO 2.6 — the tracked child entity of the app root that paints the
    /// surfaces in `roots` other than the app surface (LogBox). Created in
    /// `main` before the window opens; see [`OverlayHost`].
    pub overlay_host: Entity<OverlayHost>,
    /// TODO 2.5 — the tags of the current hover chain, innermost node first
    /// (RN's `PointerHoverTracker` path). Empty when the pointer is not over any
    /// RN node; `events::hover` diffs it to emit enter/leave.
    pub hovered: Vec<i32>,
    /// TODO 2.5 — the last pointer position, so a leave that is not caused by a
    /// move (the pointer left the window) still reports where it came from.
    pub pointer: Point<Pixels>,
    pub top_inset: f32,
    /// Target fixed at primary-button down. RN keeps a touch's target stable
    /// across drags, so responder moves/releases must still reach this node
    /// after the pointer leaves its bounds.
    pub active_touch_target: Option<crate::events::Target>,
    /// The screen whose Escape dismissal already announced its lifecycle
    /// events. The following Fabric Remove should not announce it twice.
    pub native_dismiss_lifecycle_pending: Option<i32>,
    /// Suppress per-mutation logging during the 10k-node performance probe.
    log_mount_ops: bool,
    /// The window-bounds observer. A dropped `Subscription`
    /// unsubscribes, and the setup closure in `main` returns right after
    /// wiring, so the store owns it for the lifetime of the window.
    pub window_bounds_subscription: Option<Subscription>,
    /// Tracks native light/dark changes for RN's Appearance event emitter.
    pub window_appearance_subscription: Option<Subscription>,
    pub navigation_keyboard_subscription: Option<Subscription>,
}

impl ViewStore {
    pub fn new(
        host: Host,
        window: impl Into<AnyWindowHandle>,
        frame_hook: FrameHook,
        overlay_host: Entity<OverlayHost>,
    ) -> Self {
        Self {
            host,
            frame_hook,
            window: window.into(),
            nodes: HashMap::new(),
            accessibility_modal_tags: BTreeSet::new(),
            roots: HashMap::new(),
            primary_surface_id: APP_SURFACE_ID,
            overlay_host,
            hovered: Vec::new(),
            pointer: point(px(0.), px(0.)),
            top_inset: 0.0,
            active_touch_target: None,
            native_dismiss_lifecycle_pending: None,
            log_mount_ops: benchmark_mode().is_none(),
            window_bounds_subscription: None,
            window_appearance_subscription: None,
            navigation_keyboard_subscription: None,
        }
    }

    pub fn register_root(&mut self, surface_id: i32, root: Entity<SurfaceRootView>) {
        self.roots.insert(surface_id, root);
    }

    /// The root view of `surface_id`, created on first use.
    ///
    /// Fabric's transactions reference the `RootView` as a parent that is never
    /// itself mounted, so the root view is created the first time a node is
    /// spliced into it. Every surface other than the app surface (TODO 2.6:
    /// surface 2, LogBox) is added as an overlay of the app surface (see
    /// `SurfaceRootView::overlays`).
    fn root_for(&mut self, surface_id: i32, cx: &mut Context<Self>) -> Entity<SurfaceRootView> {
        if let Some(root) = self.roots.get(&surface_id) {
            return root.clone();
        }
        let root = cx.new(|_| SurfaceRootView::new(surface_id));
        self.roots.insert(surface_id, root.clone());
        if surface_id != self.primary_surface_id {
            log::info!("[store] surface {surface_id} registered as an overlay");
            self.overlay_host.update(cx, |host, cx| {
                host.insert(surface_id, root.clone());
                cx.notify();
            });
        }
        root
    }

    /// TODO 2.6 — C++ told us a surface is gone. Fabric emits no `Delete`
    /// mutations for a dying surface (`SurfaceManager::stopSurface` only clears
    /// the surface's `UIManager`), so the tree has to be dropped here:
    ///
    /// * [`rn_gpui_sys::ALL_SURFACES`] — the whole React instance is going away
    ///   (a reload). Every node is dropped, otherwise the reloaded instance
    ///   would reuse Fabric tags and mount on top of the stale tree.
    /// * a surface id — that surface (LogBox) is hidden: its nodes go away and
    ///   its root leaves the app root's overlay list, because an empty
    ///   full-size overlay would swallow every hover and click.
    pub fn surface_stopped(&mut self, surface_id: i32, cx: &mut Context<Self>) {
        if surface_id == rn_gpui_sys::ALL_SURFACES {
            log::info!(
                "[store] React instance going away: dropping {} nodes and every root child",
                self.nodes.len()
            );
            self.nodes.clear();
            self.accessibility_modal_tags.clear();
            self.hovered.clear();
            self.active_touch_target = None;
            let roots: Vec<Entity<SurfaceRootView>> = self.roots.values().cloned().collect();
            for root in roots {
                root.update(cx, |root, cx| {
                    root.children.clear();
                    cx.notify();
                });
            }
            self.overlay_host.update(cx, |host, cx| {
                host.clear();
                cx.notify();
            });
            cx.notify();
            return;
        }

        let stale: Vec<i32> = self
            .nodes
            .iter()
            .filter(|(_, node)| node.read(cx).surface_id == surface_id)
            .map(|(tag, _)| *tag)
            .collect();
        let dropped = stale.len();
        if self
            .active_touch_target
            .as_ref()
            .is_some_and(|target| stale.contains(&target.tag))
        {
            self.active_touch_target = None;
        }
        for tag in stale {
            self.nodes.remove(&tag);
            self.accessibility_modal_tags.remove(&tag);
            self.overlay_host.update(cx, |host, cx| {
                host.remove_modal(tag);
                cx.notify();
            });
        }
        let live: HashSet<i32> = self.nodes.keys().copied().collect();
        self.hovered.retain(|tag| live.contains(tag));
        if let Some(root) = self.roots.remove(&surface_id) {
            self.overlay_host.update(cx, |host, cx| {
                host.remove(surface_id);
                cx.notify();
            });
            root.update(cx, |root, cx| {
                root.children.clear();
                cx.notify();
            });
        }
        log::info!("[store] surface {surface_id} stopped: dropped {dropped} nodes");
        cx.notify();
    }

    /// The window changed size: hand Fabric the new surface
    /// constraints so it re-lays out and emits a fresh mount batch (which the
    /// drain task in `main` applies like any other transaction).
    ///
    /// `width`/`height` are the window's viewport (content) size in logical
    /// pixels — the title bar is not part of the React surface — and `scale` is
    /// the display scale factor (TODO 2.2 feeds the same value to
    /// `start_surface`).
    pub fn resize(&mut self, width: f32, height: f32, scale: f32) {
        let surfaces: Vec<i32> = self.roots.keys().copied().collect();
        for surface_id in surfaces {
            log::info!("[store] surface {surface_id} resized to {width}x{height}@{scale}x");
            self.host.set_surface_size(surface_id, width, height, scale);
        }
    }

    /// Apply one Fabric transaction.
    ///
    /// Ops are always applied in order: Fabric emits `Create`/`Update` before
    /// the `Insert` that splices the node into the tree, so a parent always
    /// exists by the time its children arrive.
    pub fn apply_batch(&mut self, batch: MountBatch, cx: &mut Context<Self>) {
        let surface_id = batch.surface_id;
        log::debug!("[store] surface {}: {} ops", surface_id, batch.ops.len());
        // Mount batches are child-first: nested screen stacks are created and
        // inserted before their outer RNSScreen is attached to its parent.
        // Resolve the complete batch topology up front so only the outer stack
        // owns navigation transitions and presentation behavior.
        let mut batch_components: HashMap<i32, String> = self
            .nodes
            .iter()
            .map(|(tag, node)| (*tag, node.read(cx).component.clone()))
            .collect();
        let mut batch_parents = HashMap::new();
        for op in &batch.ops {
            if matches!(op.kind, MountKind::Create) {
                batch_components.insert(op.tag, op.component.clone());
            } else if matches!(op.kind, MountKind::Insert) {
                batch_parents.insert(op.tag, op.parent_tag);
            }
        }
        let screen_stacks: Vec<i32> = batch_components
            .iter()
            .filter_map(|(tag, component)| (component == "RNSScreenStack").then_some(*tag))
            .collect();
        let mut nested_screen_stacks = HashSet::new();
        for stack_tag in screen_stacks {
            let mut cursor = Some(stack_tag);
            let mut visited = HashSet::new();
            while let Some(tag) = cursor {
                if !visited.insert(tag) {
                    break;
                }
                let parent_tag = batch_parents.get(&tag).copied().or_else(|| {
                    self.nodes.get(&tag).and_then(|node| {
                        node.read(cx)
                            .parent
                            .as_ref()
                            .and_then(|parent| parent.upgrade())
                            .map(|parent| parent.read(cx).tag)
                    })
                });
                let Some(parent_tag) = parent_tag else {
                    break;
                };
                if batch_components
                    .get(&parent_tag)
                    .is_some_and(|component| component == "RNSScreen")
                {
                    nested_screen_stacks.insert(stack_tag);
                    break;
                }
                cursor = Some(parent_tag);
            }
        }
        if std::env::var_os("RN_GPUI_DEBUG_SCREENS").is_some() && !nested_screen_stacks.is_empty() {
            log::info!("[screens] nested stack tags={nested_screen_stacks:?}");
        }
        // Fabric unmounts a subtree bottom-up. Decide which outgoing cards
        // need animation before applying any mutation, and keep their entire
        // GPUI subtree attached until the exit finishes. Deleting registry
        // entries still happens immediately, so retired cards cannot receive
        // new RN events or be mistaken for live stack entries.
        let removed_screens: HashSet<i32> = batch
            .ops
            .iter()
            .filter(|op| matches!(op.kind, MountKind::Remove) && op.component == "RNSScreen")
            .map(|op| op.tag)
            .collect();
        let mut pop_plans = HashMap::new();
        let mut retained_descendants = HashSet::new();
        for op in batch
            .ops
            .iter()
            .filter(|op| matches!(op.kind, MountKind::Remove) && op.component == "RNSScreen")
        {
            let Some(stack) = self.nodes.get(&op.parent_tag) else {
                continue;
            };
            let stack = stack.read(cx);
            if stack.component != "RNSScreenStack" || nested_screen_stacks.contains(&op.parent_tag)
            {
                continue;
            }
            let live_screens: Vec<_> = stack
                .children
                .iter()
                .filter(|(tag, node)| {
                    self.nodes.contains_key(tag) && node.read(cx).component == "RNSScreen"
                })
                .map(|(tag, _)| *tag)
                .collect();
            if live_screens.last().copied() != Some(op.tag) {
                continue;
            }
            let revealed = live_screens
                .iter()
                .rev()
                .find(|tag| !removed_screens.contains(tag))
                .copied();
            let Some(screen) = self.nodes.get(&op.tag) else {
                continue;
            };
            let animation = screen.read(cx).screen_stack_animation.clone();
            let native_dismiss_already_animated =
                self.native_dismiss_lifecycle_pending == Some(op.tag);
            let retain = !native_dismiss_already_animated
                && revealed.is_some()
                && !cx.reduce_motion()
                && screen_transition_mode(&animation).is_some();
            if retain {
                let retained_before = retained_descendants.len();
                let mut descendants: Vec<_> = screen
                    .read(cx)
                    .children
                    .iter()
                    .map(|(_, node)| node.clone())
                    .collect();
                while let Some(node) = descendants.pop() {
                    let node = node.read(cx);
                    if retained_descendants.insert(node.tag) {
                        descendants.extend(node.children.iter().map(|(_, node)| node.clone()));
                    }
                }
                log::info!(
                    "[screens] preserve outgoing={} descendants={}",
                    op.tag,
                    retained_descendants.len() - retained_before
                );
            }
            pop_plans.insert(op.tag, (revealed, animation));
        }
        for op in batch.ops.iter() {
            match op.kind {
                MountKind::Create | MountKind::Update => {
                    if op.view.accessibility_modal
                        || (op.component == "ModalHostView" && op.modal_visible)
                    {
                        self.accessibility_modal_tags.insert(op.tag);
                    } else {
                        self.accessibility_modal_tags.remove(&op.tag);
                    }
                }
                MountKind::Delete | MountKind::Remove => {
                    self.accessibility_modal_tags.remove(&op.tag);
                }
                _ => {}
            }
            if self.log_mount_ops {
                log_mount_op(op);
            }
            match op.kind {
                MountKind::Create => {
                    if op.component == "RNSFullWindowOverlay" {
                        log::info!(
                            "[screens] full window overlay created tag={} frame={}x{}",
                            op.tag,
                            op.frame.w,
                            op.frame.h
                        );
                    } else if unsupported_screens_component(&op.component) {
                        log::error!(
                            "[screens] component {} is not implemented on gpui",
                            op.component
                        );
                    }
                    if op.component == "NativeViewHost" {
                        log::info!(
                            "[native-view] Fabric created tag={} factory='{}' props={}",
                            op.tag,
                            op.native_view_name,
                            op.native_view_props
                        );
                    }
                    let node = cx.new(|_| RNNodeView::from_op(op, surface_id));
                    self.nodes.insert(op.tag, node);
                }
                MountKind::Delete => {
                    if matches!(
                        op.component.as_str(),
                        "ModalHostView" | "RNSFullWindowOverlay"
                    ) {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_modal(op.tag);
                            cx.notify();
                        });
                    }
                    self.nodes.remove(&op.tag);
                }
                MountKind::Insert => {
                    let Some(child) = self.nodes.get(&op.tag).cloned() else {
                        log::warn!("[store] insert of unknown tag {}", op.tag);
                        continue;
                    };
                    {
                        let node = child.read(cx);
                        if node.view.accessibility_modal
                            || (node.component == "ModalHostView" && node.modal_visible)
                        {
                            self.accessibility_modal_tags.insert(op.tag);
                        }
                    }
                    if matches!(
                        op.component.as_str(),
                        "ModalHostView" | "RNSFullWindowOverlay"
                    ) {
                        child.update(cx, |child, _cx| child.parent = None);
                        if op.component == "RNSFullWindowOverlay" || child.read(cx).modal_visible {
                            if op.component == "RNSFullWindowOverlay" {
                                log::info!("[screens] full window overlay mounted tag={}", op.tag);
                            }
                            self.overlay_host.update(cx, |host, cx| {
                                host.insert_modal(op.tag, child.clone());
                                cx.notify();
                            });
                        }
                        continue;
                    }
                    let index = op.index.max(0) as usize;
                    if let Some(parent) = self.nodes.get(&op.parent_tag).cloned() {
                        let parent_is_screen_stack = {
                            let parent = parent.read(cx);
                            parent.component == "RNSScreenStack"
                                && !nested_screen_stacks.contains(&op.parent_tag)
                        };
                        let previous_top_screen = parent_is_screen_stack
                            .then(|| {
                                parent
                                    .read(cx)
                                    .children
                                    .iter()
                                    .rev()
                                    .find_map(|(tag, node)| {
                                        let node = node.read(cx);
                                        (node.component == "RNSScreen"
                                            && self.nodes.contains_key(tag))
                                        .then_some(*tag)
                                    })
                            })
                            .flatten();
                        let parent_ref = parent.downgrade();
                        let parent_frame_width = parent.read(cx).frame.w;
                        let child_frame_height = child.read(cx).frame.h;
                        let child_is_header_subview =
                            child.read(cx).component == "RNSScreenStackHeaderSubview";
                        let child_is_header_title_subview = child_is_header_subview
                            && matches!(
                                child.read(cx).screen_header_subview_type.as_str(),
                                "center" | "title"
                            );
                        let parent_is_header_subview =
                            parent.read(cx).component == "RNSScreenStackHeaderSubview";
                        let parent_is_header_config =
                            parent.read(cx).component == "RNSScreenStackHeaderConfig";
                        let parent_is_screen = parent.read(cx).component == "RNSScreen";
                        let parent_header_hidden = {
                            let parent = parent.read(cx);
                            parent.hidden_header_ancestor
                                || (parent.component == "RNSScreenStackHeaderConfig"
                                    && parent.screen_header_hidden)
                        };
                        let parent_screen_header_hidden = parent_is_screen
                            && parent.read(cx).children.iter().any(|(_, sibling)| {
                                let sibling = sibling.read(cx);
                                sibling.component == "RNSScreenStackHeaderConfig"
                                    && sibling.screen_header_hidden
                            });
                        let child_is_header_config =
                            child.read(cx).component == "RNSScreenStackHeaderConfig";
                        let child_header_hidden = child.read(cx).screen_header_hidden;
                        let existing_content_wrapper = parent_is_screen
                            .then(|| {
                                parent.read(cx).children.iter().find_map(|(_, sibling)| {
                                    (sibling.read(cx).component == "RNSScreenContentWrapper")
                                        .then(|| sibling.clone())
                                })
                            })
                            .flatten();
                        parent.update(cx, |parent, cx| {
                            parent.insert_child(index, op.tag, child.clone());
                            if parent_is_header_subview {
                                parent.header_subview_content_height =
                                    parent.header_subview_content_height.max(child_frame_height);
                            }
                            if parent_is_header_config && child_is_header_title_subview {
                                parent.screen_header_has_title_subview = true;
                            }
                            cx.notify();
                        });
                        if parent_is_screen_stack && op.component == "RNSScreen" {
                            let animation = child.read(cx).screen_stack_animation.clone();
                            log::info!(
                                "[screens] screen inserted tag={} animation={} presentation={} reduce_motion={}",
                                op.tag,
                                animation,
                                child.read(cx).screen_stack_presentation,
                                cx.reduce_motion()
                            );
                            let mode =
                                screen_transition_mode(&animation).filter(|_| !cx.reduce_motion());
                            let transition_duration = mode.map(|mode| match mode {
                                crate::node_view::ScreenTransitionMode::Fade => {
                                    Duration::from_millis(150)
                                }
                                _ => Duration::from_millis(240),
                            });
                            let transition_started_at = transition_duration.map(|_| Instant::now());
                            if let Some(mode) = mode {
                                let duration = transition_duration.unwrap();
                                let started_at = transition_started_at.unwrap();
                                log::info!(
                                    "[screens] push transition incoming={} outgoing={:?} animation={} mode={mode:?}",
                                    op.tag,
                                    previous_top_screen,
                                    animation
                                );
                                if child.read(cx).screen_stack_presentation == "push" {
                                    if let Some(previous_tag) = previous_top_screen {
                                        if let Some(previous) =
                                            self.nodes.get(&previous_tag).cloned()
                                        {
                                            previous.update(cx, |previous, cx| {
                                                previous.screen_transition =
                                                    Some(ScreenTransition {
                                                        mode,
                                                        role: ScreenTransitionRole::Exit,
                                                        started_at,
                                                        duration,
                                                        distance_factor: 0.12,
                                                    });
                                                cx.notify();
                                            });
                                        }
                                    }
                                }
                                child.update(cx, |child, cx| {
                                    child.screen_transition = Some(ScreenTransition {
                                        mode,
                                        role: ScreenTransitionRole::Enter,
                                        started_at,
                                        duration,
                                        distance_factor: 1.0,
                                    });
                                    cx.notify();
                                });
                            }
                            dispatch_screen_lifecycle_will(
                                &self.host,
                                previous_top_screen,
                                Some(op.tag),
                            );
                            if let Some(duration) = transition_duration {
                                let transition_started_at = transition_started_at.unwrap();
                                let outgoing = previous_top_screen;
                                let incoming = Some(op.tag);
                                let host = self.host.clone();
                                cx.spawn(async move |store, cx| {
                                    cx.background_executor().timer(duration).await;
                                    let _ = store.update(cx, |store, cx| {
                                        if let Some(outgoing_node) =
                                            outgoing.and_then(|tag| store.nodes.get(&tag).cloned())
                                        {
                                            outgoing_node.update(cx, |outgoing, cx| {
                                                if outgoing.screen_transition.is_some_and(
                                                    |transition| {
                                                        transition.started_at
                                                            == transition_started_at
                                                    },
                                                ) {
                                                    outgoing.screen_transition = None;
                                                    cx.notify();
                                                }
                                            });
                                        }
                                        dispatch_screen_lifecycle_did(&host, outgoing, incoming);
                                    });
                                })
                                .detach();
                            } else {
                                dispatch_screen_lifecycle_did(
                                    &self.host,
                                    previous_top_screen,
                                    Some(op.tag),
                                );
                            }
                        }
                        if child_is_header_subview {
                            child.update(cx, |child, _cx| {
                                child.header_container_width = parent_frame_width;
                            });
                        }
                        if parent_header_hidden {
                            child.update(cx, |child, cx| {
                                child.hidden_header_ancestor = true;
                                cx.notify();
                            });
                        }
                        if child.read(cx).component == "RNSScreenContentWrapper" {
                            child.update(cx, |child, _cx| {
                                child.screen_content_wrapper_header_hidden =
                                    parent_screen_header_hidden;
                            });
                        }
                        if parent_is_screen && child_is_header_config {
                            if let Some(content_wrapper) = existing_content_wrapper {
                                content_wrapper.update(cx, |wrapper, cx| {
                                    wrapper.screen_content_wrapper_header_hidden =
                                        child_header_hidden;
                                    cx.notify();
                                });
                            }
                        }
                        // TODO 2.4 — remember the chain so `locationX/Y` can be
                        // computed relative to the node that was hit.
                        child.update(cx, |child, _cx| child.parent = Some(parent_ref));
                    } else {
                        // A child of the surface's RootView, which is never
                        // mounted itself — the root view is created on first use
                        // (TODO 2.6 also brings up the LogBox overlay this way).
                        let root = self.root_for(surface_id, cx);
                        root.update(cx, |root, cx| {
                            root.insert_child(index, op.tag, child.clone());
                            cx.notify();
                        });
                        // A root child has no parent node to offset against.
                        child.update(cx, |child, _cx| child.parent = None);
                    }
                }
                MountKind::Remove => {
                    if retained_descendants.contains(&op.tag) {
                        continue;
                    }
                    if matches!(
                        op.component.as_str(),
                        "ModalHostView" | "RNSFullWindowOverlay"
                    ) {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_modal(op.tag);
                            cx.notify();
                        });
                        continue;
                    }
                    if let Some(parent) = self.nodes.get(&op.parent_tag).cloned() {
                        let mut retain_screen_for_transition = false;
                        if op.component == "RNSScreen"
                            && parent.read(cx).component == "RNSScreenStack"
                        {
                            if let Some((revealed_screen, animation)) = pop_plans.get(&op.tag) {
                                let revealed_screen = *revealed_screen;
                                // The revealed screen may still carry its old push-exit
                                // offset/opacity. Restore its resting pose before painting
                                // the outgoing card above it.
                                if let Some(screen) = revealed_screen
                                    .and_then(|tag| self.nodes.get(&tag))
                                    .cloned()
                                {
                                    screen.update(cx, |screen, cx| {
                                        screen.screen_transition = None;
                                        cx.notify();
                                    });
                                }
                                let mode = screen_transition_mode(&animation)
                                    .filter(|_| !cx.reduce_motion());
                                let duration = mode.map(|mode| match mode {
                                    crate::node_view::ScreenTransitionMode::Fade => {
                                        Duration::from_millis(150)
                                    }
                                    _ => Duration::from_millis(240),
                                });
                                let outgoing_mode = mode.map(|mode| match mode {
                                    crate::node_view::ScreenTransitionMode::SlideFromRight => {
                                        crate::node_view::ScreenTransitionMode::SlideFromLeft
                                    }
                                    crate::node_view::ScreenTransitionMode::SlideFromLeft => {
                                        crate::node_view::ScreenTransitionMode::SlideFromRight
                                    }
                                    crate::node_view::ScreenTransitionMode::Fade => mode,
                                });
                                let native_dismiss_already_animated =
                                    self.native_dismiss_lifecycle_pending == Some(op.tag);
                                let retain_outgoing = !native_dismiss_already_animated
                                    && outgoing_mode.is_some()
                                    && revealed_screen.is_some();
                                retain_screen_for_transition = retain_outgoing;
                                log::info!(
                                    "[screens] pop transition outgoing={} incoming={:?} animation={} outgoing_mode={outgoing_mode:?} retained={retain_outgoing}",
                                    op.tag,
                                    revealed_screen,
                                    animation
                                );
                                if retain_outgoing {
                                    if let (Some(mode), Some(duration), Some(screen)) =
                                        (outgoing_mode, duration, self.nodes.get(&op.tag).cloned())
                                    {
                                        screen.update(cx, |screen, cx| {
                                            screen.screen_transition = Some(ScreenTransition {
                                                mode,
                                                role: ScreenTransitionRole::Exit,
                                                started_at: Instant::now(),
                                                duration,
                                                distance_factor: 1.0,
                                            });
                                            cx.notify();
                                        });
                                    }
                                }
                                if self.native_dismiss_lifecycle_pending != Some(op.tag) {
                                    dispatch_screen_lifecycle_will(
                                        &self.host,
                                        Some(op.tag),
                                        revealed_screen,
                                    );
                                }
                                if retain_outgoing {
                                    let parent_tag = op.parent_tag;
                                    let screen_tag = op.tag;
                                    let duration = duration.unwrap_or_default();
                                    cx.spawn(async move |store, cx| {
                                        cx.background_executor().timer(duration).await;
                                        let _ = store.update(cx, |store, cx| {
                                            if let Some(parent) =
                                                store.nodes.get(&parent_tag).cloned()
                                            {
                                                parent.update(cx, |parent, cx| {
                                                    parent.remove_child(screen_tag);
                                                    cx.notify();
                                                });
                                                log::info!(
                                                    "[screens] pop finished outgoing={screen_tag}"
                                                );
                                            }
                                            dispatch_screen_lifecycle_did(
                                                &store.host,
                                                Some(screen_tag),
                                                revealed_screen,
                                            );
                                        });
                                    })
                                    .detach();
                                }
                                if !retain_outgoing && !native_dismiss_already_animated {
                                    dispatch_screen_lifecycle_did(
                                        &self.host,
                                        Some(op.tag),
                                        revealed_screen,
                                    );
                                }
                            }
                            if self.native_dismiss_lifecycle_pending == Some(op.tag) {
                                self.native_dismiss_lifecycle_pending = None;
                            }
                        }
                        if !retain_screen_for_transition {
                            parent.update(cx, |parent, cx| {
                                parent.remove_child(op.tag);
                                cx.notify();
                            });
                        }
                    } else if let Some(root) = self.roots.get(&surface_id).cloned() {
                        root.update(cx, |root, cx| {
                            root.remove_child(op.tag);
                            cx.notify();
                        });
                    }
                }
                MountKind::Update => {
                    if let Some(node) = self.nodes.get(&op.tag).cloned() {
                        let previous_activity_state = node.read(cx).screen_activity_state;
                        node.update(cx, |node, cx| {
                            node.update_from_op(op);
                            cx.notify();
                        });
                        if op.component == "RNSScreen" && op.props_changed {
                            let next_activity_state = node.read(cx).screen_activity_state;
                            for event in screen_lifecycle_events(
                                previous_activity_state,
                                next_activity_state,
                            ) {
                                log::debug!(
                                    "[screens] tag={} activity={}->{} event={event}",
                                    op.tag,
                                    previous_activity_state,
                                    next_activity_state
                                );
                                self.host
                                    .dispatch_event(op.tag, event, &serde_json::json!({}));
                            }
                        }
                        if matches!(
                            op.component.as_str(),
                            "ModalHostView" | "RNSFullWindowOverlay"
                        ) {
                            let visible = node.read(cx).modal_visible;
                            self.overlay_host.update(cx, |host, cx| {
                                if op.component == "RNSFullWindowOverlay" || visible {
                                    host.insert_modal(op.tag, node.clone());
                                } else {
                                    host.remove_modal(op.tag);
                                }
                                cx.notify();
                            });
                        }
                        if op.component == "RNSScreenStackHeaderConfig" {
                            let hidden = node.read(cx).screen_header_hidden;
                            let header_children = node
                                .read(cx)
                                .children
                                .iter()
                                .map(|(_, child)| child.clone())
                                .collect::<Vec<_>>();
                            for child in header_children {
                                set_header_ancestor_hidden(child, hidden, cx);
                            }
                            let parent = node
                                .read(cx)
                                .parent
                                .as_ref()
                                .and_then(|parent| parent.upgrade());
                            if let Some(parent) = parent {
                                let wrappers = parent
                                    .read(cx)
                                    .children
                                    .iter()
                                    .filter_map(|(_, child)| {
                                        (child.read(cx).component == "RNSScreenContentWrapper")
                                            .then(|| child.clone())
                                    })
                                    .collect::<Vec<_>>();
                                for wrapper in wrappers {
                                    wrapper.update(cx, |wrapper, cx| {
                                        wrapper.screen_content_wrapper_header_hidden = hidden;
                                        cx.notify();
                                    });
                                }
                            }
                        }
                    }
                }
                _ => log::warn!("[store] unknown mount kind {}", op.kind.repr),
            }
            // ScrollView's JS implementation installs `onLayout` callbacks on
            // both its viewport and content container. Fabric's native event
            // subscription is not reflected in BaseViewProps::onLayout here,
            // so emit layout for mounted views; nodes without a JS listener
            // simply discard it in their EventEmitter.
            if op.layout_changed && matches!(op.component.as_str(), "View" | "ScrollView") {
                self.host.dispatch_event(
                    op.tag,
                    "topLayout",
                    &serde_json::json!({
                        "layout": {
                            "x": op.frame.x,
                            "y": op.frame.y,
                            "width": op.frame.w,
                            "height": op.frame.h
                        }
                    }),
                );
            }
        }
        // A batch means RN just committed, so tick its `EventBeat` right away
        // instead of waiting for the next frame (TODO 2.3, see `frame.rs`).
        self.host.on_render();
        // ...and keep the per-frame chain alive for the frames this commit
        // triggers (a timer or animation that keeps committing does not need a
        // native event to keep it going).
        let hook = self.frame_hook.clone();
        let _ = cx.update_window(self.window, |_root, window, _cx| {
            hook.arm(window);
            window.on_next_frame(crate::accessibility::sync_modal_focus);
        });
    }
}

fn set_header_ancestor_hidden(node: Entity<RNNodeView>, hidden: bool, cx: &mut Context<ViewStore>) {
    let children = node
        .read(cx)
        .children
        .iter()
        .map(|(_, child)| child.clone())
        .collect::<Vec<_>>();
    node.update(cx, |node, cx| {
        node.hidden_header_ancestor = hidden;
        cx.notify();
    });
    for child in children {
        set_header_ancestor_hidden(child, hidden, cx);
    }
}

/// Translate react-native-screens' activity-state edges into its lifecycle
/// event contract. State 1 is the transition boundary: entering it announces
/// will-appear/disappear; leaving it toward 2/0 completes appear/disappear.
fn screen_lifecycle_events(previous: f32, next: f32) -> &'static [&'static str] {
    match (previous < 1.0, previous >= 2.0, next < 1.0, next >= 2.0) {
        (true, _, false, true) => &["topWillAppear", "topAppear"],
        (true, _, false, false) => &["topWillAppear"],
        (_, true, false, false) => &["topWillDisappear"],
        (false, false, true, _) => &["topDisappear"],
        (false, true, true, _) => &["topWillDisappear", "topDisappear"],
        (false, false, false, true) => &["topAppear"],
        _ => &[],
    }
}

pub(crate) fn dispatch_screen_lifecycle_will(
    host: &Host,
    outgoing: Option<i32>,
    incoming: Option<i32>,
) {
    for (tag, event) in [
        outgoing.map(|tag| (tag, "topWillDisappear")),
        incoming.map(|tag| (tag, "topWillAppear")),
    ]
    .into_iter()
    .flatten()
    {
        log::info!("[screens] tag={tag} lifecycle={event}");
        host.dispatch_event(tag, event, &serde_json::json!({}));
    }
}

pub(crate) fn dispatch_screen_lifecycle_did(
    host: &Host,
    outgoing: Option<i32>,
    incoming: Option<i32>,
) {
    for (tag, event) in [
        outgoing.map(|tag| (tag, "topDisappear")),
        incoming.map(|tag| (tag, "topAppear")),
    ]
    .into_iter()
    .flatten()
    {
        log::info!("[screens] tag={tag} lifecycle={event}");
        host.dispatch_event(tag, event, &serde_json::json!({}));
    }
    // Timer completion can happen after the display-frame chain goes idle.
    // Wake Fabric now so callbacks arrive before a later pop unmounts them.
    host.on_render();
}

#[cfg(test)]
mod screen_lifecycle_tests {
    use super::{screen_lifecycle_events, unsupported_screens_component};

    #[test]
    fn activity_state_edges_emit_lifecycle_in_order() {
        assert_eq!(screen_lifecycle_events(0.0, 1.0), &["topWillAppear"]);
        assert_eq!(screen_lifecycle_events(1.0, 2.0), &["topAppear"]);
        assert_eq!(screen_lifecycle_events(2.0, 1.0), &["topWillDisappear"]);
        assert_eq!(screen_lifecycle_events(1.0, 0.0), &["topDisappear"]);
        assert_eq!(
            screen_lifecycle_events(0.0, 2.0),
            &["topWillAppear", "topAppear"]
        );
        assert_eq!(
            screen_lifecycle_events(2.0, 0.0),
            &["topWillDisappear", "topDisappear"]
        );
        assert!(screen_lifecycle_events(1.0, 1.0).is_empty());
    }

    #[test]
    fn unsupported_screens_components_are_identified_explicitly() {
        for name in [
            "RNSSearchBar",
            "RNSBottomTabs",
            "RNSBottomTabsScreen",
            "RNSScreenFooter",
            "RNSSplitView",
            "RNSSplitViewScreen",
        ] {
            assert!(unsupported_screens_component(name), "{name}");
        }
        assert!(!unsupported_screens_component("RNSScreen"));
    }
}

fn log_mount_op(op: &MountOp) {
    log::debug!(
        "[store]   {:<6} tag={} parent={} index={} {:<30} frame=({:.1},{:.1} {:.1}x{:.1}) props_changed={} activity={} header_subview={}",
        kind_name(op.kind),
        op.tag,
        op.parent_tag,
        op.index,
        op.component,
        op.frame.x,
        op.frame.y,
        op.frame.w,
        op.frame.h,
        op.props_changed,
        op.screen_activity_state,
        op.screen_header_subview_type,
    );
}

/// cxx models a shared enum as a struct with a `repr` field, so the match is
/// intentionally not exhaustive.
fn kind_name(kind: MountKind) -> &'static str {
    match kind {
        MountKind::Create => "Create",
        MountKind::Delete => "Delete",
        MountKind::Insert => "Insert",
        MountKind::Remove => "Remove",
        MountKind::Update => "Update",
        _ => "Unknown",
    }
}

/// TODO 2.6 — the LogBox host: a window-sized slot painted above the app
/// surface, holding the roots of every non-app surface that is currently
/// visible (surface 2 = LogBox).
///
/// Why a separate entity instead of appending to the app root's children: GPUI
/// only re-runs an entity's `render` when that entity is *tracked* by the window
/// (see `App::notify` — an untracked entity's notify only fires observers, it
/// never invalidates the frame). The window's root view is the app surface, and
/// invalidating it after the first frame turned out to be a no-op, so an overlay
/// pushed into its `render` never appeared. A child entity that is present in
/// the element tree from the very first frame *is* tracked — the same mechanism
/// RN nodes use to repaint on `Update` — so this host is created before the
/// window opens and only ever toggles its own contents.
pub struct OverlayHost {
    overlays: Vec<(i32, Entity<SurfaceRootView>)>,
    modals: Vec<(i32, Entity<RNNodeView>)>,
}

impl OverlayHost {
    pub fn new() -> Self {
        Self {
            overlays: Vec::new(),
            modals: Vec::new(),
        }
    }

    pub fn insert(&mut self, surface_id: i32, overlay: Entity<SurfaceRootView>) {
        if !self.overlays.iter().any(|(id, _)| *id == surface_id) {
            self.overlays.push((surface_id, overlay));
        }
    }

    pub fn remove(&mut self, surface_id: i32) {
        self.overlays.retain(|(id, _)| *id != surface_id);
    }

    pub fn clear(&mut self) {
        self.overlays.clear();
        self.modals.clear();
    }

    pub fn insert_modal(&mut self, tag: i32, modal: Entity<RNNodeView>) {
        if !self.modals.iter().any(|(existing, _)| *existing == tag) {
            self.modals.push((tag, modal));
        }
    }

    pub fn remove_modal(&mut self, tag: i32) {
        self.modals.retain(|(existing, _)| *existing != tag);
    }
}

impl Render for OverlayHost {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        // Kept absolute so the empty host is exactly 0x0: a full-size empty div
        // would swallow every hover and click meant for the app behind it.
        let host = div().absolute().top_0().left_0();
        if self.overlays.is_empty() && self.modals.is_empty() {
            host
        } else {
            host.size_full()
                .children(self.overlays.iter().map(|(_, overlay)| overlay.clone()))
                .children(self.modals.iter().map(|(_, modal)| modal.clone()))
        }
    }
}

/// The window's root view. One per React Native surface.
pub struct SurfaceRootView {
    surface_id: i32,
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    /// TODO 2.6 — set on the app surface only: the tracked child that paints
    /// LogBox (see [`OverlayHost`]) above this surface's children.
    pub overlay_host: Option<Entity<OverlayHost>>,
    #[cfg(all(target_os = "macos", feature = "visual-capture"))]
    native_view_probe: Option<Entity<crate::native_view_probe::NativeViewCompositionProbeView>>,
}

impl SurfaceRootView {
    pub fn new(surface_id: i32) -> Self {
        Self {
            surface_id,
            children: Vec::new(),
            overlay_host: None,
            #[cfg(all(target_os = "macos", feature = "visual-capture"))]
            native_view_probe: None,
        }
    }

    /// The app surface hands its root the overlay slot created in `main` before
    /// the window opened (see [`OverlayHost`] for why it has to exist up front).
    pub fn with_overlay_host(mut self, overlay_host: Entity<OverlayHost>) -> Self {
        self.overlay_host = Some(overlay_host);
        self
    }

    #[cfg(all(target_os = "macos", feature = "visual-capture"))]
    pub fn with_native_view_probe(
        mut self,
        native_view_probe: Entity<crate::native_view_probe::NativeViewCompositionProbeView>,
    ) -> Self {
        self.native_view_probe = Some(native_view_probe);
        self
    }

    /// Splice in a root child (a Fabric node whose parent is the surface's
    /// `RootView`), keeping RN's ordering.
    pub fn insert_child(&mut self, index: usize, tag: i32, child: Entity<RNNodeView>) {
        let index = index.min(self.children.len());
        self.children.insert(index, (tag, child));
    }

    pub fn remove_child(&mut self, tag: i32) {
        self.children.retain(|(child_tag, _)| *child_tag != tag);
    }
}

impl Render for SurfaceRootView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(target_os = "macos")]
        let has_fabric_native_view = self
            .children
            .iter()
            .any(|(_, child)| node_tree_contains_native_view(child, cx));
        let mut root = div()
            .size_full()
            .relative()
            // TODO 2.5 — the pointer left the window: RN's "pointer left the
            // root" case, which leaves every node on the hover chain. The root
            // stays hovered while any descendant is hit, so this only fires when
            // the cursor really is gone.
            .on_mouse_exit(cx.listener(|_this, _event, window, cx| {
                crate::events::leave_root(window, cx);
            }))
            .children(self.children.iter().map(|(_, child)| child.clone()));
        if self.surface_id == APP_SURFACE_ID {
            for (button, event_name) in [
                (
                    MouseButton::Navigate(NavigationDirection::Back),
                    "hardwareBackPress",
                ),
                (
                    MouseButton::Navigate(NavigationDirection::Forward),
                    "hardwareForwardPress",
                ),
            ] {
                root = root.on_mouse_down(
                    button,
                    cx.listener(move |_this, _event, window, cx| {
                        if let Some(store) = cx.try_global::<StoreGlobal>() {
                            let store = store.0.read(cx);
                            store.host.emit_device_event(event_name);
                            store.frame_hook.arm(window);
                            log::info!("[navigation] emitted {event_name} from mouse button");
                        }
                        cx.stop_propagation();
                    }),
                );
            }
        }
        #[cfg(all(target_os = "macos", feature = "visual-capture"))]
        if let Some(native_view_probe) = &self.native_view_probe {
            root = root.child(native_view_probe.clone());
        }
        // TODO 2.6 — LogBox (surface 2) paints after the app surface.
        if let Some(overlay_host) = &self.overlay_host {
            #[cfg(target_os = "macos")]
            {
                let has_native_composition = has_fabric_native_view || {
                    #[cfg(feature = "visual-capture")]
                    {
                        self.native_view_probe.is_some()
                    }
                    #[cfg(not(feature = "visual-capture"))]
                    {
                        false
                    }
                };
                if has_native_composition {
                    // GPUI's deferred pass targets the window composition overlay
                    // surface, above native views.
                    root = root.child(deferred(overlay_host.clone()).priority(100));
                } else {
                    root = root.child(overlay_host.clone());
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                root = root.child(overlay_host.clone());
            }
        }
        root
    }
}

#[cfg(target_os = "macos")]
fn node_tree_contains_native_view(node: &Entity<RNNodeView>, cx: &App) -> bool {
    let node = node.read(cx);
    node.component == "NativeViewHost"
        || node
            .children
            .iter()
            .any(|(_, child)| node_tree_contains_native_view(child, cx))
}

/// Keeps `App` in scope for callers that only need the store's helpers.
pub fn store_from(cx: &App) -> Option<Entity<ViewStore>> {
    cx.try_global::<StoreGlobal>()
        .map(|global| global.0.clone())
}
