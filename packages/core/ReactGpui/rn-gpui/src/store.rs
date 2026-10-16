use crate::frame::FrameHook;
use crate::host::Host;
use crate::node_view::{
    inherit, screen_transition_mode, InheritInput, Inherited, RNNodeView, ScreenTransition,
    ScreenTransitionRole,
};
#[cfg(target_os = "macos")]
use gpui::deferred;
use gpui::{
    div, point, prelude::*, px, AnyWindowHandle, App, Context, Entity, Global, IntoElement,
    MouseButton, NavigationDirection, Pixels, Point, Subscription, Window,
};
use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp};
use std::cell::{Cell, RefCell};
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

pub const APP_SURFACE_ID: i32 = 1;

pub struct StoreGlobal(pub Entity<ViewStore>);
impl Global for StoreGlobal {}

pub struct ViewStore {
    pub host: Host,
    pub frame_hook: FrameHook,
    pub window: AnyWindowHandle,
    pub windows: HashMap<i32, AnyWindowHandle>,
    /// Fabric tags are unique across the surfaces of one React instance.
    pub nodes: HashMap<i32, Entity<RNNodeView>>,
    pub(crate) accessibility_modal_tags: BTreeSet<i32>,
    pub roots: HashMap<i32, Entity<SurfaceRootView>>,
    pub primary_surface_id: i32,
    pub overlay_host: Entity<OverlayHost>,
    /// Interior mutability on purpose: pointer movement must not update the store
    /// entity, which nearly every node reads while rendering.
    pub hovered: RefCell<Vec<i32>>,
    pub pointer: Cell<Point<Pixels>>,
    pub top_inset: f32,
    /// Target fixed at primary-button down. RN keeps a touch's target stable
    /// across drags, so responder moves/releases must still reach this node
    /// after the pointer leaves its bounds.
    pub active_touch_target: Option<crate::events::Target>,
    /// The screen whose Escape dismissal already announced its lifecycle
    /// events. The following Fabric Remove should not announce it twice.
    pub native_dismiss_lifecycle_pending: Option<i32>,
    log_mount_ops: bool,
    /// A dropped `Subscription` unsubscribes, so the store owns it.
    pub window_bounds_subscription: Option<Subscription>,
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
        let window = window.into();
        Self {
            host,
            frame_hook,
            window,
            windows: HashMap::from([(APP_SURFACE_ID, window)]),
            nodes: HashMap::new(),
            accessibility_modal_tags: BTreeSet::new(),
            roots: HashMap::new(),
            primary_surface_id: APP_SURFACE_ID,
            overlay_host,
            hovered: RefCell::new(Vec::new()),
            pointer: Cell::new(point(px(0.), px(0.))),
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

    pub fn register_window(&mut self, surface_id: i32, window: AnyWindowHandle) {
        self.windows.insert(surface_id, window);
    }

    pub fn unregister_window(&mut self, surface_id: i32) {
        self.windows.remove(&surface_id);
    }

    pub fn window_for(&self, surface_id: i32) -> Option<AnyWindowHandle> {
        self.windows
            .get(&surface_id)
            .copied()
            .or_else(|| (surface_id == APP_SURFACE_ID).then_some(self.window))
    }

    pub fn surfaces_in_window(&self, window: AnyWindowHandle) -> Vec<i32> {
        self.windows
            .iter()
            .filter(|(_, handle)| **handle == window)
            .map(|(surface, _)| *surface)
            .collect()
    }

    /// Fabric references the `RootView` as a parent that is never itself mounted,
    /// so the root view is created the first time a node is spliced into it.
    fn root_for(&mut self, surface_id: i32, cx: &mut Context<Self>) -> Entity<SurfaceRootView> {
        if let Some(root) = self.roots.get(&surface_id) {
            return root.clone();
        }
        let root = cx.new(|_| SurfaceRootView::new(surface_id));
        self.roots.insert(surface_id, root.clone());
        // A surface with no registered window belongs to the main window. That
        // covers LogBox (surface 2), which C++ starts directly, and any surface
        // that mounted before the window registry adopted it.
        let window = self.window_for(surface_id).unwrap_or(self.window);
        if surface_id != self.primary_surface_id && window == self.window {
            log::info!("[store] surface {surface_id} registered as an overlay");
            self.overlay_host.update(cx, |host, cx| {
                host.insert(surface_id, root.clone());
                cx.notify();
            });
        }
        root
    }

    /// Fabric emits no `Delete` mutations for a dying surface. On a reload every
    /// node must go, or the new instance would reuse tags on top of the stale tree.
    pub fn surface_stopped(&mut self, surface_id: i32, cx: &mut Context<Self>) {
        if surface_id == rn_gpui_sys::ALL_SURFACES {
            log::info!(
                "[store] React instance going away: dropping {} nodes and every root child",
                self.nodes.len()
            );
            self.nodes.clear();
            self.accessibility_modal_tags.clear();
            self.hovered.borrow_mut().clear();
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
                host.remove_portal(tag);
                cx.notify();
            });
        }
        let live: HashSet<i32> = self.nodes.keys().copied().collect();
        self.hovered.borrow_mut().retain(|tag| live.contains(tag));
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
        self.windows.remove(&surface_id);
        log::info!("[store] surface {surface_id} stopped: dropped {dropped} nodes");
        cx.notify();
    }

    pub fn resize(&mut self, width: f32, height: f32, scale: f32) {
        let surfaces: Vec<i32> = self.roots.keys().copied().collect();
        for surface_id in surfaces {
            let height = height - crate::desktop::gpui_menu::menu_bar_inset();
            log::info!("[store] surface {surface_id} resized to {width}x{height}@{scale}x");
            self.host.set_surface_size(surface_id, width, height, scale);
        }
    }

    pub fn resize_window(&mut self, window: AnyWindowHandle, width: f32, height: f32, scale: f32) {
        for surface_id in self.surfaces_in_window(window) {
            let height = height - crate::desktop::gpui_menu::menu_bar_inset();
            log::info!(
                "[store] surface {surface_id} resized to {width}x{height}@{scale}x (window-scoped)"
            );
            self.host.set_surface_size(surface_id, width, height, scale);
        }
    }

    /// Fabric emits `Create`/`Update` before the `Insert` that splices a node in,
    /// so a parent always exists when its children arrive.
    pub fn apply_batch(&mut self, batch: MountBatch, cx: &mut Context<Self>) {
        let surface_id = batch.surface_id;
        log::debug!("[store] surface {}: {} ops", surface_id, batch.ops.len());
        let handle = crate::extensions::StoreHandle::new(cx.entity());
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
                && !crate::animation_policy::animations_disabled()
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
                    let is_visible_portal = crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    )
                    .is_some_and(|portal| portal.visible);
                    if op.view.accessibility_modal || is_visible_portal {
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
                    self.nodes.insert(op.tag, node.clone());
                    let component_node = node.read(cx).component_node(cx);
                    for observer in crate::extensions::store_observers() {
                        observer.on_mount(&component_node, &handle, cx);
                    }
                }
                MountKind::Delete => {
                    if crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    )
                    .is_some()
                    {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_portal(op.tag);
                            cx.notify();
                        });
                    }
                    self.nodes.remove(&op.tag);
                    for observer in crate::extensions::store_observers() {
                        observer.on_remove(op.tag, &handle, cx);
                    }
                }
                MountKind::Insert => {
                    let Some(child) = self.nodes.get(&op.tag).cloned() else {
                        log::warn!("[store] insert of unknown tag {}", op.tag);
                        continue;
                    };
                    {
                        let node = child.read(cx);
                        let is_visible_portal = crate::extensions::component_portal(
                            &op.component,
                            &crate::extensions::parse_extension_props(&op.extension_props_json),
                        )
                        .is_some_and(|portal| portal.visible);
                        if node.view.accessibility_modal || is_visible_portal {
                            self.accessibility_modal_tags.insert(op.tag);
                        }
                    }
                    if let Some(portal) = crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    ) {
                        child.update(cx, |child, _cx| child.parent = None);
                        if portal.visible {
                            self.overlay_host.update(cx, |host, cx| {
                                host.insert_portal(op.tag, child.clone());
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
                                cx.reduce_motion() || crate::animation_policy::animations_disabled()
                            );
                            let mode = screen_transition_mode(&animation).filter(|_| {
                                !cx.reduce_motion()
                                    && !crate::animation_policy::animations_disabled()
                            });
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
                        child.update(cx, |child, _cx| child.parent = Some(parent_ref));
                    } else {
                        let root = self.root_for(surface_id, cx);
                        let (root_surface, before) = {
                            let root_ref = root.read(cx);
                            (root_ref.surface_id, root_ref.children.len())
                        };
                        log::info!(
                            "[store-debug] root child tag={} batch_surface={} root_surface={} children={}",
                            op.tag,
                            surface_id,
                            root_surface,
                            before
                        );
                        root.update(cx, |root, cx| {
                            root.insert_child(index, op.tag, child.clone());
                            cx.notify();
                        });
                        child.update(cx, |child, _cx| child.parent = None);
                    }
                }
                MountKind::Remove => {
                    if retained_descendants.contains(&op.tag) {
                        continue;
                    }
                    if crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    )
                    .is_some()
                    {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_portal(op.tag);
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
                                let mode = screen_transition_mode(&animation).filter(|_| {
                                    !cx.reduce_motion()
                                        && !crate::animation_policy::animations_disabled()
                                });
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
                                            // The outgoing screen is gone from its
                                            // parent's children, which is one of
                                            // the modal-sibling inputs.
                                            store.refresh_inherited(surface_id, cx);
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
                        let previous_node = node.read(cx).component_node(cx);
                        node.update(cx, |node, cx| {
                            node.update_from_op(op);
                            cx.notify();
                        });
                        let updated_node = node.read(cx).component_node(cx);
                        for observer in crate::extensions::store_observers() {
                            observer.on_update(&updated_node, &previous_node, &handle, cx);
                        }
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
                        if let Some(portal) = crate::extensions::component_portal(
                            &op.component,
                            &crate::extensions::parse_extension_props(&op.extension_props_json),
                        ) {
                            self.overlay_host.update(cx, |host, cx| {
                                if portal.visible {
                                    host.insert_portal(op.tag, node.clone());
                                } else {
                                    host.remove_portal(op.tag);
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
            // A scrolling component's JS implementation installs `onLayout`
            // callbacks on both its viewport and its content container.
            // Fabric's native event subscription is not reflected in
            // BaseViewProps::onLayout here, so emit layout for a mounted
            // scrolling view; a node without a JS listener discards it in its
            // EventEmitter.
            let is_scroll = crate::extensions::component_scroll(
                &op.component,
                &crate::extensions::parse_extension_props(&op.extension_props_json),
            )
            .is_some();
            if op.layout_changed && (op.component == "View" || is_scroll) {
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
        self.refresh_inherited(surface_id, cx);
        self.host.on_render();
        let hook = self.frame_hook.clone();
        let target = self.window_for(surface_id).unwrap_or(self.window);
        let _ = cx.update_window(target, |_root, window, _cx| {
            hook.arm(window);
            window.on_next_frame(crate::accessibility::sync_modal_focus);
        });
    }

    /// Writes a node only when its value changed, and notifies it only when a
    /// value its own `render` reads changed.
    pub(crate) fn refresh_inherited(&mut self, surface_id: i32, cx: &mut Context<Self>) {
        let mut roots: Vec<Entity<RNNodeView>> = Vec::new();
        if let Some(root) = self.roots.get(&surface_id) {
            roots.extend(root.read(cx).children.iter().map(|(_, node)| node.clone()));
        }
        // A portal is spliced with no React Native parent and painted by the
        // overlay host instead, so it is a second root.
        for (_, portal) in self.overlay_host.read(cx).portals.iter() {
            if portal.read(cx).surface_id == surface_id && portal.read(cx).parent.is_none() {
                roots.push(portal.clone());
            }
        }
        // The pass runs while this entity is being updated, so `origin_frame`
        // cannot read the store back out of the global; hand it the value.
        let top_inset = self.top_inset;
        for root in roots {
            refresh_inherited_tree(root, top_inset, None, cx);
        }
    }
}

fn refresh_inherited_tree(
    node: Entity<RNNodeView>,
    top_inset: f32,
    parent: Option<(Inherited, InheritInput)>,
    cx: &mut Context<ViewStore>,
) {
    let own = {
        let view = node.read(cx);
        view.inherit_input(top_inset)
    };
    let inherited = inherit(parent.as_ref().map(|(parent, input)| (parent, input)), &own);
    let (children, modal_children, changed, render_affecting) = {
        let view = node.read(cx);
        let children: Vec<Entity<RNNodeView>> = view
            .children
            .iter()
            .map(|(_, child)| child.clone())
            .collect();
        let modal_children = children
            .iter()
            .filter(|child| child.read(cx).view.accessibility_modal)
            .count();
        (
            children,
            modal_children,
            !view.inherited.same(&inherited),
            !view.inherited.same_render_affecting(&inherited),
        )
    };
    if changed {
        node.update(cx, |view, cx| {
            view.inherited = inherited.clone();
            if render_affecting {
                cx.notify();
            }
        });
    }
    for child in children {
        let child_is_modal = child.read(cx).view.accessibility_modal;
        let mut parent_input = own.clone();
        parent_input.other_modal_child = modal_children > usize::from(child_is_modal);
        refresh_inherited_tree(
            child,
            top_inset,
            Some((inherited.clone(), parent_input)),
            cx,
        );
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

/// Hides a component and its subtree. The extension API's `StoreHandle` calls
/// this, so a module can hide a screen without the store's own code.
pub(crate) fn set_component_hidden(
    store: &Entity<ViewStore>,
    tag: i32,
    hidden: bool,
    cx: &mut App,
) {
    store.update(cx, |store, cx| {
        if let Some(node) = store.nodes.get(&tag).cloned() {
            set_header_ancestor_hidden(node, hidden, cx);
        }
    });
}

/// Starts a transition on a component. The extension API's `StoreHandle`
/// calls this.
pub(crate) fn start_component_transition(
    store: &Entity<ViewStore>,
    tag: i32,
    transition: crate::extensions::Transition,
    cx: &mut App,
) {
    use crate::node_view::{ScreenTransition, ScreenTransitionMode, ScreenTransitionRole};
    let mode = match transition.kind {
        crate::extensions::TransitionKind::SlideFromRight => ScreenTransitionMode::SlideFromRight,
        crate::extensions::TransitionKind::SlideFromLeft => ScreenTransitionMode::SlideFromLeft,
        crate::extensions::TransitionKind::Fade => ScreenTransitionMode::Fade,
    };
    store.update(cx, |store, cx| {
        if let Some(node) = store.nodes.get(&tag).cloned() {
            node.update(cx, |node, cx| {
                node.screen_transition = Some(ScreenTransition {
                    mode,
                    role: ScreenTransitionRole::Enter,
                    started_at: std::time::Instant::now(),
                    duration: std::time::Duration::from_millis(transition.duration_ms),
                    distance_factor: transition.distance_factor,
                });
                cx.notify();
            });
        }
    });
}

/// A `StoreHandle` for a throwaway store, used by the extension tests.
#[cfg(test)]
pub(crate) fn test_store_handle(cx: &mut gpui::TestAppContext) -> crate::extensions::StoreHandle {
    let overlay_host = cx.new(|_| OverlayHost::new());
    let window = cx.open_window(gpui::size(gpui::px(120.0), gpui::px(100.0)), {
        let overlay_host = overlay_host.clone();
        move |_, _| SurfaceRootView::new(1).with_overlay_host(overlay_host)
    });
    let root = window.root(cx).unwrap();
    let any_window: gpui::AnyWindowHandle = window.into();
    let host = crate::host::Host::test_stub();
    let frame_hook = FrameHook::new(host.clone());
    let store = cx.new(|_| ViewStore::new(host, any_window, frame_hook, overlay_host));
    cx.update(|cx| cx.set_global(StoreGlobal(store.clone())));
    let _ = root;
    crate::extensions::StoreHandle::new(store)
}

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

#[cfg(test)]
mod test_app_context_tests {
    use super::{OverlayHost, StoreGlobal, SurfaceRootView, ViewStore};
    use crate::{frame::FrameHook, host::Host};
    use gpui::{px, AppContext, TestAppContext};
    use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp, ParagraphFlat, RectF, ViewPropsFlat};

    fn op(kind: MountKind) -> MountOp {
        MountOp {
            kind,
            tag: 101,
            parent_tag: -1,
            index: 0,
            component: "View".into(),
            native_view_name: String::new(),
            native_view_props: "{}".into(),
            frame: RectF {
                x: 10.0,
                y: 12.0,
                w: 40.0,
                h: 30.0,
            },
            props_changed: true,
            view: ViewPropsFlat {
                opacity: 1.0,
                ..Default::default()
            },
            extension_props_json: String::new(),
            has_paragraph: false,
            paragraph: ParagraphFlat::default(),
            screen_header_title: String::new(),
            screen_header_subview_type: String::new(),
            screen_header_background_color: 0,
            screen_header_title_color: 0,
            screen_header_tint_color: 0,
            screen_header_hidden: false,
            screen_header_hide_back: false,
            screen_activity_state: 0.0,
            screen_stack_animation: String::new(),
            screen_stack_presentation: String::new(),
            layout_changed: false,
        }
    }

    #[gpui::test]
    fn test_app_context_mounts_a_view_and_resolves_its_pointer_target(cx: &mut TestAppContext) {
        let overlay_host = cx.new(|_| OverlayHost::new());
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), {
            let overlay_host = overlay_host.clone();
            move |_, _| SurfaceRootView::new(1).with_overlay_host(overlay_host)
        });
        let root = window.root(cx).unwrap();
        let any_window: gpui::AnyWindowHandle = window.into();
        let host = Host::test_stub();
        let frame_hook = FrameHook::new(host.clone());
        let store = cx.new(|_| ViewStore::new(host, any_window, frame_hook, overlay_host));
        cx.update(|cx| cx.set_global(StoreGlobal(store.clone())));
        store.update(cx, |store, _| store.register_root(1, root));

        cx.update_entity(&store, |store, cx| {
            store.apply_batch(
                MountBatch {
                    surface_id: 1,
                    ops: vec![op(MountKind::Create), op(MountKind::Insert)],
                },
                cx,
            );
        });

        cx.update_window(any_window, |_, window, app| {
            let needs_clear = window.draw(app);
            needs_clear.clear(app);
            window.dispatch_event(
                gpui::PlatformInput::MouseMove(gpui::MouseMoveEvent {
                    position: gpui::point(px(20.0), px(20.0)),
                    pressed_button: None,
                    ..Default::default()
                }),
                app,
            );
        })
        .unwrap();
        let hit = cx.read_entity(&store, |store, _| store.hovered.borrow().first().copied());
        assert_eq!(hit, Some(101));
    }

    #[gpui::test]
    fn test_driver_frames_follow_transforms_and_visibility_clips(cx: &mut TestAppContext) {
        let overlay_host = cx.new(|_| OverlayHost::new());
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), {
            let overlay_host = overlay_host.clone();
            move |_, _| SurfaceRootView::new(1).with_overlay_host(overlay_host)
        });
        let root = window.root(cx).expect("surface root exists");
        let any_window: gpui::AnyWindowHandle = window.into();
        let host = Host::test_stub();
        let frame_hook = FrameHook::new(host.clone());
        let store = cx.new(|_| ViewStore::new(host, any_window, frame_hook, overlay_host));
        cx.update(|cx| cx.set_global(StoreGlobal(store.clone())));
        store.update(cx, |store, _| store.register_root(1, root));

        let mut create = op(MountKind::Create);
        create.view.has_transform = true;
        create.view.transform = [
            2.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 8.0, 6.0, 0.0, 1.0,
        ];
        let mut insert = op(MountKind::Insert);
        insert.view = create.view.clone();
        cx.update_entity(&store, |store, cx| {
            store.apply_batch(
                MountBatch {
                    surface_id: 1,
                    ops: vec![create, insert],
                },
                cx,
            );
        });

        let transformed = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_frame(store, 101, app).expect("mounted frame")
        });
        assert_eq!((transformed.x, transformed.y), (18.0, 18.0));
        assert_eq!((transformed.w, transformed.h), (80.0, 15.0));

        let clipped = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_visible_frame(
                store,
                101,
                RectF {
                    x: 0.0,
                    y: 0.0,
                    w: 20.0,
                    h: 20.0,
                },
                app,
            )
        });
        let clipped = clipped.expect("transformed frame intersects viewport");
        assert_eq!((clipped.x, clipped.y), (18.0, 18.0));
        assert_eq!((clipped.w, clipped.h), (2.0, 2.0));

        let outside = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_visible_frame(
                store,
                101,
                RectF {
                    x: 100.0,
                    y: 80.0,
                    w: 20.0,
                    h: 20.0,
                },
                app,
            )
        });
        assert!(outside.is_none(), "off-window view must be invisible");

        let mut hidden = op(MountKind::Update);
        hidden.view.display_none = true;
        cx.update_entity(&store, |store, cx| {
            store.apply_batch(
                MountBatch {
                    surface_id: 1,
                    ops: vec![hidden],
                },
                cx,
            );
        });
        let hidden_frame = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_visible_frame(
                store,
                101,
                RectF {
                    x: 0.0,
                    y: 0.0,
                    w: 120.0,
                    h: 100.0,
                },
                app,
            )
        });
        assert!(
            hidden_frame.is_none(),
            "display:none view must be invisible"
        );
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

/// A separate entity because GPUI only re-runs `render` for entities the window
/// tracked while drawing, and the root view is not invalidated after its first
/// frame. Created before the window opens; it only toggles its own contents.
pub struct OverlayHost {
    overlays: Vec<(i32, Entity<SurfaceRootView>)>,
    portals: Vec<(i32, Entity<RNNodeView>)>,
}

impl OverlayHost {
    pub fn new() -> Self {
        Self {
            overlays: Vec::new(),
            portals: Vec::new(),
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
        self.portals.clear();
    }

    /// Adds a window-level portal. A portal is a component its renderer
    /// declared through `ComponentRenderer::portal`, such as a modal.
    pub fn insert_portal(&mut self, tag: i32, portal: Entity<RNNodeView>) {
        if !self.portals.iter().any(|(existing, _)| *existing == tag) {
            self.portals.push((tag, portal));
        }
    }

    pub fn remove_portal(&mut self, tag: i32) {
        self.portals.retain(|(existing, _)| *existing != tag);
    }
}

impl Render for OverlayHost {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        // Kept absolute so the empty host is exactly 0x0: a full-size empty div
        // would swallow every hover and click meant for the app behind it.
        let host = div().absolute().top_0().left_0();
        if self.overlays.is_empty() && self.portals.is_empty() {
            host
        } else {
            host.size_full()
                .children(self.overlays.iter().map(|(_, overlay)| overlay.clone()))
                .children(self.portals.iter().map(|(_, portal)| portal.clone()))
        }
    }
}

pub struct SurfaceRootView {
    surface_id: i32,
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    pub overlay_host: Option<Entity<OverlayHost>>,
    pub perf_monitor: Option<Entity<crate::desktop::perf_monitor::PerfMonitor>>,
    pub menu_bar: Option<Entity<crate::desktop::gpui_menu::MenuBar>>,
    /// Kept alive for as long as the surface: dropping it would stop the
    /// window-activation callback that dismisses an open menu on focus loss.
    pub menu_bar_activation_subscription: Option<Subscription>,
    #[cfg(all(target_os = "macos", feature = "visual-capture"))]
    native_view_probe: Option<Entity<crate::native_view_probe::NativeViewCompositionProbeView>>,
}

impl SurfaceRootView {
    pub fn new(surface_id: i32) -> Self {
        Self {
            surface_id,
            children: Vec::new(),
            overlay_host: None,
            perf_monitor: None,
            menu_bar: None,
            menu_bar_activation_subscription: None,
            #[cfg(all(target_os = "macos", feature = "visual-capture"))]
            native_view_probe: None,
        }
    }

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
            // The root stays hovered while any descendant is hit, so this only fires when
            // the pointer left the window.
            .on_mouse_exit(cx.listener(|_this, _event, window, cx| {
                crate::events::leave_root(window, cx);
            }))
            .children(self.children.iter().map(|(_, child)| child.clone()));
        #[cfg(all(target_os = "macos", feature = "visual-capture"))]
        if let Some(native_view_probe) = &self.native_view_probe {
            root = root.child(native_view_probe.clone());
        }
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
        if let Some(monitor) = self.perf_monitor.clone() {
            root = root.child(monitor);
        }
        // The hardware navigation buttons belong to the window, not the
        // surface: the handlers go on the outermost element so the in-window
        // menu bar (Linux) cannot swallow a press aimed at the app.
        // A press in the app body dismisses an open GPUI menu: clicking away
        // from a menu is expected to close it. The handler is in the capture
        // phase so the press is seen before any RN view consumes it, and it is
        // on the content area *below* the menu bar — a press on a menu title
        // still opens/replaces that menu, and the popup's own item clicks are in
        // its separate window and never reach here. `dismiss` resolves the menu
        // with `None`, the documented "dismissed" outcome for a context menu.
        let content = div()
            .id("surface-content")
            .flex_1()
            .min_h_0()
            .capture_any_mouse_down(cx.listener(|_this, _event, _window, cx| {
                let _ = crate::desktop::gpui_menu::MenuPopup::dismiss(cx);
            }))
            .child(root);
        let mut window_root = if let Some(menu_bar) = self.menu_bar.clone() {
            div()
                .size_full()
                .flex()
                .flex_col()
                .child(menu_bar)
                .child(content)
        } else {
            div().size_full().child(content)
        };
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
                window_root = window_root.on_mouse_down(
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
        window_root.into_any_element()
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

pub fn store_from(cx: &App) -> Option<Entity<ViewStore>> {
    cx.try_global::<StoreGlobal>()
        .map(|global| global.0.clone())
}
