//! The window-side view store (design doc §18.12).
//!
//! `ViewStore` owns the per-surface view trees and the React host. Fabric's
//! mount batches arrive on the JS thread and are forwarded to this store on the
//! main thread, where they are applied to GPUI entities.
//!
//! TODO 1.10 turns the ops into `RNNodeView`s and splices them into the
//! `SurfaceRootView` of each surface.

use crate::frame::FrameHook;
use crate::host::Host;
use crate::node_view::RNNodeView;
use gpui::{
    deferred, div, point, prelude::*, px, AnyWindowHandle, App, Context, Entity, Global,
    IntoElement, Pixels, Point, Subscription, Window,
};
use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp};
use std::collections::{HashMap, HashSet};

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
    /// Suppress per-mutation logging during the 10k-node performance probe.
    log_mount_ops: bool,
    /// TODO 1.12 — the window-bounds observer. A dropped `Subscription`
    /// unsubscribes, and the setup closure in `main` returns right after
    /// wiring, so the store owns it for the lifetime of the window.
    pub window_bounds_subscription: Option<Subscription>,
    /// Tracks native light/dark changes for RN's Appearance event emitter.
    pub window_appearance_subscription: Option<Subscription>,
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
            roots: HashMap::new(),
            primary_surface_id: APP_SURFACE_ID,
            overlay_host,
            hovered: Vec::new(),
            pointer: point(px(0.), px(0.)),
            log_mount_ops: std::env::var_os("RN_GPUI_BENCH_MODE").is_none(),
            window_bounds_subscription: None,
            window_appearance_subscription: None,
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
            self.hovered.clear();
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
        for tag in stale {
            self.nodes.remove(&tag);
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

    /// TODO 1.12 — the window changed size: hand Fabric the new surface
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
        for op in batch.ops.iter() {
            if self.log_mount_ops {
                log_mount_op(op);
            }
            match op.kind {
                MountKind::Create => {
                    let node = cx.new(|_| RNNodeView::from_op(op, surface_id));
                    self.nodes.insert(op.tag, node);
                }
                MountKind::Delete => {
                    if op.component == "ModalHostView" {
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
                    if op.component == "ModalHostView" {
                        child.update(cx, |child, _cx| child.parent = None);
                        if child.read(cx).modal_visible {
                            self.overlay_host.update(cx, |host, cx| {
                                host.insert_modal(op.tag, child.clone());
                                cx.notify();
                            });
                        }
                        continue;
                    }
                    let index = op.index.max(0) as usize;
                    if let Some(parent) = self.nodes.get(&op.parent_tag).cloned() {
                        let parent_ref = parent.downgrade();
                        parent.update(cx, |parent, cx| {
                            parent.insert_child(index, op.tag, child.clone());
                            cx.notify();
                        });
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
                    if op.component == "ModalHostView" {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_modal(op.tag);
                            cx.notify();
                        });
                        continue;
                    }
                    if let Some(parent) = self.nodes.get(&op.parent_tag).cloned() {
                        parent.update(cx, |parent, cx| {
                            parent.remove_child(op.tag);
                            cx.notify();
                        });
                    } else if let Some(root) = self.roots.get(&surface_id).cloned() {
                        root.update(cx, |root, cx| {
                            root.remove_child(op.tag);
                            cx.notify();
                        });
                    }
                }
                MountKind::Update => {
                    if let Some(node) = self.nodes.get(&op.tag).cloned() {
                        node.update(cx, |node, cx| {
                            node.update_from_op(op);
                            cx.notify();
                        });
                        if op.component == "ModalHostView" {
                            let visible = node.read(cx).modal_visible;
                            self.overlay_host.update(cx, |host, cx| {
                                if visible {
                                    host.insert_modal(op.tag, node.clone());
                                } else {
                                    host.remove_modal(op.tag);
                                }
                                cx.notify();
                            });
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
        let _ = cx.update_window(self.window, |_root, window, _cx| hook.arm(window));
    }
}

fn log_mount_op(op: &MountOp) {
    log::debug!(
        "[store]   {:<6} tag={} parent={} index={} {:<10} frame=({:.1},{:.1} {:.1}x{:.1}) props_changed={}",
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

    pub fn len(&self) -> usize {
        self.overlays.len() + self.modals.len()
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
    pub surface_id: i32,
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    /// TODO 2.6 — set on the app surface only: the tracked child that paints
    /// LogBox (see [`OverlayHost`]) above this surface's children.
    pub overlay_host: Option<Entity<OverlayHost>>,
    #[cfg(target_os = "macos")]
    native_view_probe: Option<Entity<crate::native_view_probe::NativeViewCompositionProbeView>>,
}

impl SurfaceRootView {
    pub fn new(surface_id: i32) -> Self {
        Self {
            surface_id,
            children: Vec::new(),
            overlay_host: None,
            #[cfg(target_os = "macos")]
            native_view_probe: None,
        }
    }

    /// The app surface hands its root the overlay slot created in `main` before
    /// the window opened (see [`OverlayHost`] for why it has to exist up front).
    pub fn with_overlay_host(mut self, overlay_host: Entity<OverlayHost>) -> Self {
        self.overlay_host = Some(overlay_host);
        self
    }

    #[cfg(target_os = "macos")]
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
        #[cfg(target_os = "macos")]
        if let Some(native_view_probe) = &self.native_view_probe {
            root = root.child(native_view_probe.clone());
        }
        // TODO 2.6 — LogBox (surface 2) paints after the app surface.
        if let Some(overlay_host) = &self.overlay_host {
            #[cfg(target_os = "macos")]
            if self.native_view_probe.is_some() {
                // GPUI's deferred pass targets the window composition overlay
                // surface, above the native test view.
                root = root.child(deferred(overlay_host.clone()).priority(100));
            } else {
                root = root.child(overlay_host.clone());
            }
            #[cfg(not(target_os = "macos"))]
            {
                root = root.child(overlay_host.clone());
            }
        }
        root
    }
}

/// Keeps `App` in scope for callers that only need the store's helpers.
pub fn store_from(cx: &App) -> Option<Entity<ViewStore>> {
    cx.try_global::<StoreGlobal>()
        .map(|global| global.0.clone())
}
