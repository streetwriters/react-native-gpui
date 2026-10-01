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
    div, prelude::*, AnyWindowHandle, App, Context, Entity, Global, IntoElement, Subscription,
    Window,
};
use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp};
use std::collections::HashMap;

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
    /// TODO 1.12 — the window-bounds observer. A dropped `Subscription`
    /// unsubscribes, and the setup closure in `main` returns right after
    /// wiring, so the store owns it for the lifetime of the window.
    pub window_bounds_subscription: Option<Subscription>,
}

impl ViewStore {
    pub fn new(host: Host, window: impl Into<AnyWindowHandle>, frame_hook: FrameHook) -> Self {
        Self {
            host,
            frame_hook,
            window: window.into(),
            nodes: HashMap::new(),
            roots: HashMap::new(),
            window_bounds_subscription: None,
        }
    }

    pub fn register_root(&mut self, surface_id: i32, root: Entity<SurfaceRootView>) {
        self.roots.insert(surface_id, root);
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
        log::info!("[store] surface {}: {} ops", surface_id, batch.ops.len());
        for op in batch.ops.iter() {
            log_mount_op(op);
            match op.kind {
                MountKind::Create => {
                    let node = cx.new(|_| RNNodeView::from_op(op));
                    self.nodes.insert(op.tag, node);
                }
                MountKind::Delete => {
                    self.nodes.remove(&op.tag);
                }
                MountKind::Insert => {
                    let Some(child) = self.nodes.get(&op.tag).cloned() else {
                        log::warn!("[store] insert of unknown tag {}", op.tag);
                        continue;
                    };
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
                    } else if let Some(root) = self.roots.get(&surface_id).cloned() {
                        root.update(cx, |root, cx| {
                            root.insert_child(index, op.tag, child.clone());
                            cx.notify();
                        });
                        // A root child has no parent node to offset against.
                        child.update(cx, |child, _cx| child.parent = None);
                    } else {
                        log::warn!("[store] insert with no root for surface {}", surface_id);
                    }
                }
                MountKind::Remove => {
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
                    }
                }
                _ => log::warn!("[store] unknown mount kind {}", op.kind.repr),
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
    log::info!(
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

/// The window's root view. One per React Native surface.
pub struct SurfaceRootView {
    pub surface_id: i32,
    pub children: Vec<(i32, Entity<RNNodeView>)>,
}

impl SurfaceRootView {
    pub fn new(surface_id: i32) -> Self {
        Self {
            surface_id,
            children: Vec::new(),
        }
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
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .relative()
            .children(self.children.iter().map(|(_, child)| child.clone()))
    }
}

/// Keeps `App` in scope for callers that only need the store's helpers.
pub fn store_from(cx: &App) -> Option<Entity<ViewStore>> {
    cx.try_global::<StoreGlobal>()
        .map(|global| global.0.clone())
}
