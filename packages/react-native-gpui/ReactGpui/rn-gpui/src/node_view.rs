//! TODO 1.9 scaffold for the per-node view of design doc §18.13.
//!
//! Fabric nodes become `RNNodeView`s in TODO 1.10, which fills in the props
//! (`style::to_refinement`), child ordering and painting. Until then this only
//! exists so `SurfaceRootView` has a concrete child type and the window can
//! open with an empty tree.

use gpui::{prelude::*, div, Context, IntoElement, Window};

pub struct RNNodeView {
    /// Fabric tag of the node this view renders.
    pub tag: i32,
}

impl RNNodeView {
    pub fn tag(&self) -> i32 {
        self.tag
    }
}

impl Render for RNNodeView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
    }
}
