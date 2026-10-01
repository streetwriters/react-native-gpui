//! One GPUI view per Fabric node (design doc §18.13, TODO 1.10).
//!
//! Phase 1 uses a GPUI `div()` **only** for absolute position, size and paint
//! styles. No flex properties are ever set, so Taffy cannot disagree with Yoga:
//! every frame comes from RN's Yoga pass.

use crate::style;
use gpui::{
    div, point, prelude::*, px, App, Context, Entity, IntoElement, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, Pixels, Point, Position, StyleRefinement, WeakEntity, Window,
};
use rn_gpui_sys::ffi::{MountOp, ParagraphFlat, RectF, ViewPropsFlat};

pub struct RNNodeView {
    /// Fabric tag.
    pub tag: i32,
    /// TODO 2.6 — the surface this node was mounted for. `ViewStore` uses it to
    /// drop exactly one surface's nodes when that surface is torn down (a
    /// reload drops every surface at once).
    pub surface_id: i32,
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
    /// The parent node, or `None` when this node hangs directly off the surface
    /// root. TODO 2.4 — events need the chain: every `div` is positioned
    /// relative to its parent, so the node's window origin is the sum of its own
    /// frame and all its ancestors' (`absolute_origin`).
    pub parent: Option<WeakEntity<RNNodeView>>,
    /// `style::to_refinement(view)`, recomputed only when props change.
    cached_style: StyleRefinement,
}

impl RNNodeView {
    pub fn from_op(op: &MountOp, surface_id: i32) -> Self {
        let mut view = Self {
            tag: op.tag,
            surface_id,
            component: op.component.clone(),
            frame: op.frame,
            view: op.view.clone(),
            paragraph: op.has_paragraph.then(|| op.paragraph.clone()),
            image_uri: (!op.image_uri.is_empty()).then(|| op.image_uri.clone()),
            children: Vec::new(),
            parent: None,
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

    /// This node's origin in window coordinates (TODO 2.4).
    ///
    /// Frames are parent-relative, so the origin is the sum along the ancestor
    /// chain; the surface root itself sits at the window origin (`store.rs`).
    pub fn absolute_origin(&self, cx: &App) -> Point<Pixels> {
        let mut origin = point(px(self.frame.x), px(self.frame.y));
        let mut parent = self.parent.clone();
        while let Some(weak) = parent {
            let Some(node) = weak.upgrade() else { break };
            let node = node.read(cx);
            origin += point(px(node.frame.x), px(node.frame.y));
            parent = node.parent.clone();
        }
        origin
    }
}

impl Render for RNNodeView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
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
        // TODO 2.4/2.5 — GPUI hit-tests these divs, so the innermost node under
        // the pointer runs its handler first; stopping propagation there is what
        // makes it RN's single touch target (see `events.rs`). A node with
        // `pointerEvents: none` gets no listeners at all, and `events::target`
        // walks up from the hit node returning `None` as soon as it finds a
        // `none` ancestor, so the whole subtree stays untouchable; the other
        // modes are resolved there too, because a `box-only` ancestor overrides
        // the hit node.
        if self.view.pointer_events != crate::events::POINTER_EVENTS_NONE {
            element = element
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, event: &MouseDownEvent, _window, cx| {
                        // `this` is the hit node and is mid-update, so it is
                        // passed by reference instead of read from the map.
                        if let Some(target) = crate::events::target(cx, this) {
                            crate::events::send(
                                cx,
                                &target,
                                event.position,
                                crate::events::Phase::Start,
                            );
                        }
                        cx.stop_propagation();
                    }),
                )
                .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _window, cx| {
                    let target = crate::events::target(cx, this);
                    if event.pressed_button.is_some() {
                        // A drag: RN touch moves need an active touch.
                        if let Some(target) = target.as_ref() {
                            crate::events::send(
                                cx,
                                target,
                                event.position,
                                crate::events::Phase::Move,
                            );
                        }
                    } else {
                        // TODO 2.5 — a hover: enter/leave for the chain. The
                        // target is `None` when `pointerEvents` made the hit
                        // subtree untouchable, which leaves the old chain.
                        crate::events::hover(cx, target.as_ref(), event.position);
                    }
                    cx.stop_propagation();
                }))
                .on_mouse_up(
                    MouseButton::Left,
                    cx.listener(|this, event: &MouseUpEvent, _window, cx| {
                        if let Some(target) = crate::events::target(cx, this) {
                            crate::events::send(
                                cx,
                                &target,
                                event.position,
                                crate::events::Phase::End,
                            );
                        }
                        cx.stop_propagation();
                    }),
                );
        }
        // Text is painted by GPUI (§18.14); the Yoga frame still comes from the
        // Rust measure handler, so both sides describe the same paragraph.
        if let Some(paragraph) = &self.paragraph {
            element = element.child(crate::text::paragraph_element(paragraph, frame.w));
        }
        element.children(self.children.iter().map(|(_, child)| child.clone()))
    }
}
