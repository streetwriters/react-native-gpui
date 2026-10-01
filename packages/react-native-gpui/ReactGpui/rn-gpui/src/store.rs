//! TODO 1.9 — the window-side view store (design doc §18.12).
//!
//! `ViewStore` owns the per-surface view trees and the React host. Fabric's
//! mount batches arrive on the JS thread and are forwarded to this store on the
//! main thread, where they are applied to GPUI entities.
//!
//! TODO 1.9 only logs the batches and owns the empty `SurfaceRootView` for
//! surface 1; TODO 1.10 turns the ops into `RNNodeView`s.

use crate::host::Host;
use gpui::{prelude::*, div, AnyWindowHandle, App, Context, Entity, Global, IntoElement, Window};
use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp};
use std::collections::HashMap;

pub struct StoreGlobal(pub Entity<ViewStore>);
impl Global for StoreGlobal {}

pub struct ViewStore {
    pub host: Host,
    pub window: AnyWindowHandle,
    /// Surface id -> the window's root view for that surface.
    pub roots: HashMap<i32, Entity<SurfaceRootView>>,
}

impl ViewStore {
    pub fn new(host: Host, window: impl Into<AnyWindowHandle>) -> Self {
        Self {
            host,
            window: window.into(),
            roots: HashMap::new(),
        }
    }

    pub fn register_root(&mut self, surface_id: i32, root: Entity<SurfaceRootView>) {
        self.roots.insert(surface_id, root);
    }

    /// Apply one Fabric transaction.
    ///
    /// TODO 1.10 replaces the logging with the actual node tree; for 1.9 this
    /// keeps the per-op trace alive after the mount channel moved off the
    /// C++ -> Rust callback. Notify only entities that changed (gpui-fast
    /// retention) — with no nodes yet there is nothing to notify.
    pub fn apply_batch(&mut self, batch: MountBatch, _cx: &mut Context<Self>) {
        log::info!(
            "[store] surface {}: {} ops",
            batch.surface_id,
            batch.ops.len()
        );
        for op in &batch.ops {
            log_mount_op(op);
        }
        // Tell RN a frame happened (drives EventBeat / effects).
        self.host.on_render();
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
    pub children: Vec<(i32, Entity<crate::node_view::RNNodeView>)>,
}

impl SurfaceRootView {
    pub fn new(surface_id: i32) -> Self {
        Self {
            surface_id,
            children: Vec::new(),
        }
    }
}

impl Render for SurfaceRootView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div().size_full().relative().children(
            self.children
                .iter()
                .map(|(_, child)| child.clone()),
        )
    }
}

/// Keeps `App` in scope for callers that only need the store's helpers.
pub fn store_from(cx: &App) -> Option<Entity<ViewStore>> {
    cx.try_global::<StoreGlobal>().map(|global| global.0.clone())
}
