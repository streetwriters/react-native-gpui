//! One GPUI view per Fabric node (design doc §18.13, TODO 1.10).
//!
//! Phase 1 uses a GPUI `div()` **only** for absolute position, size and paint
//! styles. No flex properties are ever set, so Taffy cannot disagree with Yoga:
//! every frame comes from RN's Yoga pass.

use crate::style;
use gpui::{
    div, point, prelude::*, px, App, Context, Entity, FocusHandle, IntoElement, KeyDownEvent,
    KeyUpEvent, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, Point, Position,
    StyleRefinement, Subscription, WeakEntity, Window,
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
    pub image_resize_mode: u8,
    pub scroll_offset: Point<f32>,
    pub content_size: (f32, f32),
    pub scroll_horizontal: bool,
    pub scroll_enabled: bool,
    pub focusable: bool,
    /// Children in RN order: (Fabric tag, entity).
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    /// The parent node, or `None` when this node hangs directly off the surface
    /// root. TODO 2.4 — events need the chain: every `div` is positioned
    /// relative to its parent, so the node's window origin is the sum of its own
    /// frame and all its ancestors' (`absolute_origin`).
    pub parent: Option<WeakEntity<RNNodeView>>,
    /// `style::to_refinement(view)`, recomputed only when props change.
    cached_style: StyleRefinement,
    focus_handle: Option<FocusHandle>,
    focus_subscriptions: Vec<Subscription>,
}

impl RNNodeView {
    /// Text and images receive the innermost mouse hit, but keyboard focus
    /// belongs to the closest focusable view containing that hit.
    fn nearest_focus_handle(&self, cx: &App) -> Option<FocusHandle> {
        if let Some(handle) = &self.focus_handle {
            return Some(handle.clone());
        }
        let mut parent = self.parent.clone();
        while let Some(node) = parent.and_then(|node| node.upgrade()) {
            let node = node.read(cx);
            if let Some(handle) = &node.focus_handle {
                return Some(handle.clone());
            }
            parent = node.parent.clone();
        }
        None
    }

    pub fn from_op(op: &MountOp, surface_id: i32) -> Self {
        let mut view = Self {
            tag: op.tag,
            surface_id,
            component: op.component.clone(),
            frame: op.frame,
            view: op.view.clone(),
            paragraph: op.has_paragraph.then(|| op.paragraph.clone()),
            image_uri: (!op.image_uri.is_empty()).then(|| op.image_uri.clone()),
            image_resize_mode: op.image_resize_mode,
            scroll_offset: point(op.scroll_x, op.scroll_y),
            content_size: (op.content_width, op.content_height),
            scroll_horizontal: op.scroll_horizontal,
            scroll_enabled: op.scroll_enabled,
            focusable: op.view.focusable,
            children: Vec::new(),
            parent: None,
            cached_style: StyleRefinement::default(),
            focus_handle: None,
            focus_subscriptions: Vec::new(),
        };
        view.cached_style = style::to_refinement(&view.view);
        view
    }

    pub fn update_from_op(&mut self, op: &MountOp) {
        self.frame = op.frame;
        if op.props_changed {
            self.view = op.view.clone();
            self.focusable = op.view.focusable;
            if !self.focusable {
                self.focus_handle = None;
                self.focus_subscriptions.clear();
            }
            // Once per prop change, not per frame.
            self.cached_style = style::to_refinement(&self.view);
        }
        if op.has_paragraph {
            self.paragraph = Some(op.paragraph.clone());
        }
        if self.component == "ScrollView" {
            self.scroll_offset = point(op.scroll_x, op.scroll_y);
            self.content_size = (op.content_width, op.content_height);
            self.scroll_horizontal = op.scroll_horizontal;
            self.scroll_enabled = op.scroll_enabled;
        }
        if !op.image_uri.is_empty() {
            self.image_uri = Some(op.image_uri.clone());
            self.image_resize_mode = op.image_resize_mode;
        } else if op.props_changed && self.component == "Image" {
            self.image_uri = None;
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
            if node.component == "ScrollView" {
                origin -= point(px(node.scroll_offset.x), px(node.scroll_offset.y));
            }
            parent = node.parent.clone();
        }
        origin
    }
}

fn dispatch_key(tag: i32, event_type: &str, key: &gpui::Keystroke, repeat: bool, cx: &App) {
    let Some(store) = cx.try_global::<crate::store::StoreGlobal>() else {
        return;
    };
    let host = store.0.read(cx).host.clone();
    let code = match key.key.as_str() {
        "tab" => "Tab",
        "enter" => "Enter",
        "escape" => "Escape",
        "space" => "Space",
        "backspace" => "Backspace",
        "delete" => "Delete",
        other => other,
    };
    let key_code = match key.key.as_str() {
        "tab" => 9,
        "enter" => 13,
        "escape" => 27,
        "space" => 32,
        "backspace" => 8,
        "delete" => 46,
        _ => 0,
    };
    host.dispatch_event(
        tag,
        event_type,
        &serde_json::json!({
            "key": if key.key == "space" { " " } else { key.key.as_str() },
            "code": code,
            "keyCode": key_code,
            "repeat": repeat,
            "shiftKey": key.modifiers.shift,
            "ctrlKey": key.modifiers.control,
            "altKey": key.modifiers.alt,
            "metaKey": key.modifiers.platform,
        }),
    );
}

impl Render for RNNodeView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let frame = self.frame;
        let is_scroll = self.component == "ScrollView";
        let mut element = div();
        if self.focusable {
            if self.focus_handle.is_none() {
                // GPUI excludes handles from traversal unless they are marked
                // as tab stops. RN's `focusable` prop opts into the same role;
                // the Fabric tag keeps order stable across rerenders.
                let handle = cx
                    .focus_handle()
                    .tab_stop(true)
                    .tab_index(self.tag as isize);
                if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                    let host = store.0.read(cx).host.clone();
                    let tag = self.tag;
                    let focused_host = host.clone();
                    self.focus_subscriptions.push(cx.on_focus(
                        &handle,
                        window,
                        move |_this, window, cx| {
                            focused_host.dispatch_event(tag, "focus", &serde_json::json!({}));
                            if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                                store.0.read(cx).frame_hook.arm(window);
                            }
                        },
                    ));
                    self.focus_subscriptions.push(cx.on_blur(
                        &handle,
                        window,
                        move |_this, window, cx| {
                            host.dispatch_event(tag, "blur", &serde_json::json!({}));
                            if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                                store.0.read(cx).frame_hook.arm(window);
                            }
                        },
                    ));
                }
                self.focus_handle = Some(handle);
            }
            if let Some(handle) = &self.focus_handle {
                element = element.track_focus(handle);
            }
            element = element
                .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                    dispatch_key(this.tag, "topKeyDown", &event.keystroke, event.is_held, cx);
                    if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                        store.0.read(cx).frame_hook.arm(window);
                    }
                    if event.keystroke.key == "tab" {
                        if event.keystroke.modifiers.shift {
                            window.focus_prev(cx);
                        } else {
                            window.focus_next(cx);
                        }
                        cx.stop_propagation();
                    }
                }))
                .on_key_up(cx.listener(|this, event: &KeyUpEvent, window, cx| {
                    dispatch_key(this.tag, "topKeyUp", &event.keystroke, false, cx);
                    if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                        store.0.read(cx).frame_hook.arm(window);
                    }
                }));
        }
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
                    cx.listener(|this, event: &MouseDownEvent, window, cx| {
                        // `this` is the hit node and is mid-update, so it is
                        // passed by reference instead of read from the map.
                        if let Some(handle) = this.nearest_focus_handle(cx) {
                            window.focus(&handle, cx);
                        }
                        if let Some(target) = crate::events::target(cx, this) {
                            crate::events::send(
                                window,
                                cx,
                                &target,
                                event.position,
                                crate::events::Phase::Start,
                            );
                        }
                        cx.stop_propagation();
                    }),
                )
                .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, window, cx| {
                    let target = crate::events::target(cx, this);
                    if event.pressed_button.is_some() {
                        // A drag: RN touch moves need an active touch.
                        if let Some(target) = target.as_ref() {
                            crate::events::send(
                                window,
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
                        crate::events::hover(window, cx, target.as_ref(), event.position);
                    }
                    cx.stop_propagation();
                }))
                .on_mouse_up(
                    MouseButton::Left,
                    cx.listener(|this, event: &MouseUpEvent, window, cx| {
                        if let Some(target) = crate::events::target(cx, this) {
                            crate::events::send(
                                window,
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
            element = element.child(crate::text::paragraph_element(paragraph, frame.w, frame.h));
        }
        if self.component == "Image" {
            if let Some(uri) = &self.image_uri {
                let fit = match self.image_resize_mode {
                    1 => gpui::ObjectFit::Contain,
                    2 => gpui::ObjectFit::Cover,
                    // RN's `center` keeps the source at its natural size,
                    // centers it, and only scales down if it would overflow.
                    3 => gpui::ObjectFit::ScaleDown,
                    _ => gpui::ObjectFit::Fill,
                };
                let source = if let Some(data) = uri.strip_prefix("data:") {
                    decode_data_image(data).map(|image| gpui::img(std::sync::Arc::new(image)))
                } else if let Some(path) = crate::image_loader::file_uri_path(uri) {
                    Some(gpui::img(path))
                } else {
                    Some(gpui::img(uri.clone()))
                };
                if let Some(source) = source {
                    element = element.child(source.size_full().object_fit(fit));
                }
            }
        }
        if is_scroll {
            let (content_width, content_height) = self.content_size;
            let mut content = div()
                .relative()
                .left(px(-self.scroll_offset.x))
                .top(px(-self.scroll_offset.y))
                .w(px(content_width.max(frame.w)))
                .h(px(content_height.max(frame.h)));
            content = content.children(self.children.iter().map(|(_, child)| child.clone()));
            element = element.overflow_hidden().child(content);
            if self.scroll_enabled {
                element = element.on_scroll_wheel(cx.listener(
                    |this, event: &gpui::ScrollWheelEvent, window, cx| {
                        // GPUI's native adapters normally provide pixel deltas;
                        // line deltas are 40 DIP per line for deterministic mice.
                        let (dx, dy) = match &event.delta {
                            gpui::ScrollDelta::Pixels(delta) => {
                                (f32::from(delta.x), f32::from(delta.y))
                            }
                            gpui::ScrollDelta::Lines(lines) => (lines.x * 40.0, lines.y * 40.0),
                        };
                        if this.scroll_by(-dx, -dy, window, cx) {
                            cx.notify();
                        }
                        cx.stop_propagation();
                    },
                ));
            }
            element
        } else {
            element.children(self.children.iter().map(|(_, child)| child.clone()))
        }
    }
}

impl RNNodeView {
    fn scroll_by(&mut self, dx: f32, dy: f32, window: &mut Window, cx: &mut Context<Self>) -> bool {
        let (max_x, max_y) = (
            (self.content_size.0 - self.frame.w).max(0.0),
            (self.content_size.1 - self.frame.h).max(0.0),
        );
        let old = self.scroll_offset;
        if self.scroll_horizontal {
            self.scroll_offset.x = (old.x + dx).clamp(0.0, max_x);
        } else {
            self.scroll_offset.y = (old.y + dy).clamp(0.0, max_y);
        }
        if self.scroll_offset == old {
            return false;
        }
        if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
            let host = store.0.read(cx).host.clone();
            let payload = serde_json::json!({
                "contentOffset": {"x": self.scroll_offset.x, "y": self.scroll_offset.y},
                "contentSize": {"width": self.content_size.0, "height": self.content_size.1},
                "layoutMeasurement": {"width": self.frame.w, "height": self.frame.h},
                "zoomScale": 1
            });
            host.dispatch_event(self.tag, "topScroll", &payload);
            host.set_scroll_offset(self.tag, self.scroll_offset.x, self.scroll_offset.y);
            store.0.read(cx).frame_hook.arm(window);
        }
        true
    }
}

/// Build a GPUI image asset from an inline data URI. GPUI still performs image
/// decoding and painting through its asynchronous asset pipeline.
fn decode_data_image(data: &str) -> Option<gpui::Image> {
    use base64::Engine;
    let (metadata, payload) = data.split_once(',')?;
    if !metadata.ends_with(";base64") {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .ok()?;
    let mime = metadata.strip_prefix("image/")?.trim_end_matches(";base64");
    let format = match mime {
        "png" => gpui::ImageFormat::Png,
        "jpeg" | "jpg" => gpui::ImageFormat::Jpeg,
        "webp" => gpui::ImageFormat::Webp,
        "gif" => gpui::ImageFormat::Gif,
        "svg+xml" | "svg" => gpui::ImageFormat::Svg,
        "bmp" => gpui::ImageFormat::Bmp,
        "tiff" | "tif" => gpui::ImageFormat::Tiff,
        "ico" => gpui::ImageFormat::Ico,
        _ => return None,
    };
    Some(gpui::Image::from_bytes(format, bytes))
}
