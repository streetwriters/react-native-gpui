//! One GPUI view per Fabric node (design doc §18.13, TODO 1.10).
//!
//! Phase 1 uses a GPUI `div()` **only** for absolute position, size and paint
//! styles. No flex properties are ever set, so Taffy cannot disagree with Yoga:
//! every frame comes from RN's Yoga pass.

use crate::style;
use gpui::{div, prelude::*, px, Context, Entity, IntoElement, Position, StyleRefinement, Window};
use rn_gpui_sys::ffi::{MountOp, ParagraphFlat, RectF, ViewPropsFlat};

pub struct RNNodeView {
    /// Fabric tag.
    pub tag: i32,
    /// Fabric component name ("View", "Paragraph", "Image", ...).
    pub component: String,
    /// Layout frame relative to the parent, already in DIPs.
    pub frame: RectF,
    /// Paint props (flattened from `BaseViewProps`).
    pub view: ViewPropsFlat,
    /// Text payload, only present for `Paragraph` nodes.
    pub paragraph: Option<ParagraphFlat>,
    /// `Image` source, only present for image nodes (TODO 2.6).
    pub image_uri: Option<String>,
    /// Children in RN order: (Fabric tag, entity).
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    /// `style::to_refinement(view)`, recomputed only when props change.
    cached_style: StyleRefinement,
}

impl RNNodeView {
    pub fn from_op(op: &MountOp) -> Self {
        let mut view = Self {
            tag: op.tag,
            component: op.component.clone(),
            frame: op.frame,
            view: op.view.clone(),
            paragraph: op.has_paragraph.then(|| op.paragraph.clone()),
            image_uri: (!op.image_uri.is_empty()).then(|| op.image_uri.clone()),
            children: Vec::new(),
            cached_style: StyleRefinement::default(),
        };
        view.cached_style = style::to_refinement(&view.view);
        view
    }

    pub fn update_from_op(&mut self, op: &MountOp) {
        self.frame = op.frame;
        if op.props_changed {
            self.view = op.view.clone();
            // Once per prop change, not per frame.
            self.cached_style = style::to_refinement(&self.view);
        }
        if op.has_paragraph {
            self.paragraph = Some(op.paragraph.clone());
        }
        if !op.image_uri.is_empty() {
            self.image_uri = Some(op.image_uri.clone());
        }
    }

    pub fn insert_child(&mut self, index: usize, tag: i32, child: Entity<RNNodeView>) {
        let index = index.min(self.children.len());
        self.children.insert(index, (tag, child));
    }

    pub fn remove_child(&mut self, tag: i32) {
        self.children.retain(|(child_tag, _)| *child_tag != tag);
    }
}

impl Render for RNNodeView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let frame = self.frame;
        let mut element = div();
        // Replace the whole style: cached paint fields + the absolute Yoga
        // frame. Nothing flex-related is ever set (see the module docs).
        *element.style() = {
            let mut style = self.cached_style.clone();
            style.position = Some(Position::Absolute);
            style.inset.left = Some(px(frame.x).into());
            style.inset.top = Some(px(frame.y).into());
            style.size.width = Some(px(frame.w).into());
            style.size.height = Some(px(frame.h).into());
            style
        };
        // TODO 1.11 paints `self.paragraph` here through `text::paragraph_element`.
        element.children(self.children.iter().map(|(_, child)| child.clone()))
    }
}
