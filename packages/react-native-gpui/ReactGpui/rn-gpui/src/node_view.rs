//! One GPUI view per Fabric node (design doc §18.13).
//!
//! Phase 1 uses a GPUI `div()` **only** for absolute position, size and paint
//! styles. No flex properties are ever set, so Taffy cannot disagree with Yoga:
//! every frame comes from RN's Yoga pass.

use crate::style;
use gpui::{
    div, point, prelude::*, px, App, Context, Entity, FocusHandle, IntoElement, KeyDownEvent,
    KeyUpEvent, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, Point, Position,
    Role, StyleRefinement, Subscription, Task, WeakEntity, Window,
};
use rn_gpui_sys::ffi::{MountOp, ParagraphFlat, RectF, ViewPropsFlat};
use std::sync::OnceLock;
use std::time::Duration;

fn debug_render_counts_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var_os("RN_GPUI_DEBUG_RENDER_COUNTS").is_some())
}

fn elapsed_since_first_render_ms() -> u128 {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_millis()
}

pub struct RNNodeView {
    /// Fabric tag.
    pub tag: i32,
    /// Render count used by TODO 3.1 to audit gpui-fast entity invalidation.
    render_count: u64,
    /// TODO 2.6 — the surface this node was mounted for. `ViewStore` uses it to
    /// drop exactly one surface's nodes when that surface is torn down (a
    /// reload drops every surface at once).
    pub surface_id: i32,
    /// Fabric component name ("View", "Paragraph", "Image", ...).
    pub component: String,
    /// Name looked up in the app's NativeViewFactory registry.
    pub native_view_name: String,
    /// JSON props forwarded to the registered native view factory.
    pub native_view_props: String,
    #[cfg(target_os = "macos")]
    native_view_host: Option<std::rc::Rc<crate::native_view::NativeViewSurface>>,
    /// Layout frame relative to the parent, already in DIPs.
    pub frame: RectF,
    /// Paint props (flattened from `BaseViewProps`).
    pub view: ViewPropsFlat,
    /// Native Animated updates transforms outside normal Fabric mount batches.
    /// outside normal mount batches. Keep that frame value separate so RN's
    /// original transform remains available when the animation detaches.
    animated_transform: Option<[f32; 16]>,
    /// Text payload, only present for `Paragraph` nodes.
    pub paragraph: Option<ParagraphFlat>,
    pub input_text: String,
    pub input_placeholder: String,
    input_placeholder_mode: bool,
    input_text_color: u32,
    input_selection_color: u32,
    pub input_multiline: bool,
    pub input_editable: bool,
    pub input_selection: std::ops::Range<usize>,
    pub(crate) input_selection_anchor: Option<usize>,
    pub input_marked: Option<std::ops::Range<usize>>,
    pub input_event_count: i32,
    caret_visible: bool,
    caret_blink_task: Task<()>,
    pub modal_visible: bool,
    /// `Image` source, only present for image nodes (TODO 2.6).
    pub image_uri: Option<String>,
    pub image_resize_mode: u8,
    pub scroll_offset: Point<f32>,
    pub content_size: (f32, f32),
    pub scroll_horizontal: bool,
    pub scroll_enabled: bool,
    pub focusable: bool,
    pending_text_input_focus: Option<bool>,
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
    pub fn apply_text_input_focus_command(
        &mut self,
        focus: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.component != "TextInput" {
            return;
        }
        if focus && !self.input_editable {
            return;
        }
        let Some(handle) = self.focus_handle.as_ref().cloned() else {
            // Fabric can deliver autoFocus immediately after mount, before
            // GPUI's first render has created the entity's FocusHandle.
            self.pending_text_input_focus = Some(focus);
            cx.notify();
            return;
        };
        if focus {
            handle.focus(window, cx);
        } else if handle.is_focused(window) {
            window.blur(cx);
        }
    }

    pub fn set_animated_opacity(&mut self, opacity: f32) {
        self.view.opacity = opacity.clamp(0.0, 1.0);
        self.cached_style = style::to_refinement(&self.view);
    }

    pub fn set_animated_transform(&mut self, transform: Option<[f32; 16]>) {
        self.animated_transform = transform;
    }

    fn start_caret_blink(&mut self, cx: &mut Context<Self>) {
        if self.component != "TextInput" {
            return;
        }
        self.caret_visible = true;
        self.caret_blink_task = cx.spawn(async move |this, cx| loop {
            cx.background_executor()
                .timer(Duration::from_millis(530))
                .await;
            if this
                .update(cx, |view, cx| {
                    view.caret_visible = !view.caret_visible;
                    cx.notify();
                })
                .is_err()
            {
                break;
            }
        });
    }

    fn stop_caret_blink(&mut self) {
        self.caret_visible = false;
        self.caret_blink_task = Task::ready(());
    }

    pub(crate) fn reset_text_input_caret(&mut self, cx: &mut Context<Self>) {
        self.start_caret_blink(cx);
    }

    fn accessibility_role(&self) -> Option<Role> {
        role_for_accessibility_role(&self.view.accessibility_role, self.view.accessible)
    }

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
            render_count: 0,
            surface_id,
            component: op.component.clone(),
            native_view_name: op.native_view_name.clone(),
            native_view_props: op.native_view_props.clone(),
            #[cfg(target_os = "macos")]
            native_view_host: None,
            frame: if op.component == "ModalHostView" {
                rn_gpui_sys::ffi::RectF {
                    x: 0.0,
                    y: 0.0,
                    ..op.frame
                }
            } else {
                op.frame
            },
            view: op.view.clone(),
            animated_transform: None,
            paragraph: op.has_paragraph.then(|| op.paragraph.clone()),
            input_text: op.text_input_text.clone(),
            input_placeholder: op.text_input_placeholder.clone(),
            input_placeholder_mode: op.text_input_text.is_empty(),
            input_selection_color: op.text_input_selection_color,
            input_text_color: op
                .paragraph
                .fragments
                .first()
                .map(|fragment| fragment.color)
                .filter(|color| *color != 0)
                .unwrap_or(0xff000000),
            input_multiline: op.text_input_multiline,
            input_editable: op.text_input_editable,
            input_selection: 0..0,
            input_selection_anchor: None,
            input_marked: None,
            input_event_count: 0,
            caret_visible: false,
            caret_blink_task: Task::ready(()),
            modal_visible: op.modal_visible,
            image_uri: (!op.image_uri.is_empty()).then(|| op.image_uri.clone()),
            image_resize_mode: op.image_resize_mode,
            scroll_offset: point(op.scroll_x, op.scroll_y),
            content_size: (op.content_width, op.content_height),
            scroll_horizontal: op.scroll_horizontal,
            scroll_enabled: op.scroll_enabled,
            focusable: op.view.focusable || op.component == "TextInput",
            pending_text_input_focus: None,
            children: Vec::new(),
            parent: None,
            cached_style: StyleRefinement::default(),
            focus_handle: None,
            focus_subscriptions: Vec::new(),
        };
        if view.component == "TextInput" {
            view.input_selection = crate::input::reconcile_selection(
                &view.input_text,
                0..0,
                op.text_input_selection_set.then(|| {
                    op.text_input_selection_start.max(0) as usize
                        ..op.text_input_selection_end.max(0) as usize
                }),
                true,
            );
            view.sync_input_paragraph();
        }
        view.cached_style = style::to_refinement(&view.view);
        view
    }

    pub fn update_from_op(&mut self, op: &MountOp) {
        if self.native_view_name != op.native_view_name
            || self.native_view_props != op.native_view_props
        {
            self.native_view_name = op.native_view_name.clone();
            self.native_view_props = op.native_view_props.clone();
            self.native_view_host = None;
        }
        self.frame = if self.component == "ModalHostView" {
            rn_gpui_sys::ffi::RectF {
                x: 0.0,
                y: 0.0,
                ..op.frame
            }
        } else {
            op.frame
        };
        if self.component == "ModalHostView" {
            self.modal_visible = op.modal_visible;
        }
        if op.props_changed {
            self.view = op.view.clone();
            self.focusable = op.view.focusable || self.component == "TextInput";
            if !self.focusable {
                self.focus_handle = None;
                self.focus_subscriptions.clear();
            }
            // Once per prop change, not per frame.
            self.cached_style = style::to_refinement(&self.view);
            if self.component == "TextInput" {
                let next_text = op.text_input_text.clone();
                let apply_text = crate::input::should_apply_text_update(
                    self.input_event_count,
                    op.text_input_most_recent_event_count,
                );
                let text_changed = apply_text && next_text != self.input_text;
                if text_changed {
                    self.input_text = next_text;
                    self.input_marked = None;
                }
                self.input_placeholder = op.text_input_placeholder.clone();
                self.input_selection_color = op.text_input_selection_color;
                self.input_multiline = op.text_input_multiline;
                self.input_editable = op.text_input_editable;
                self.input_selection = crate::input::reconcile_selection(
                    &self.input_text,
                    self.input_selection.clone(),
                    op.text_input_selection_set.then(|| {
                        op.text_input_selection_start.max(0) as usize
                            ..op.text_input_selection_end.max(0) as usize
                    }),
                    false,
                );
            }
        }
        if op.has_paragraph {
            self.paragraph = Some(op.paragraph.clone());
            if let Some(fragment) = op.paragraph.fragments.first() {
                if fragment.color != 0 && !self.input_placeholder_mode {
                    self.input_text_color = fragment.color;
                }
            }
        }
        if self.component == "TextInput" {
            self.sync_input_paragraph();
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

    fn local_transform(&self) -> (f32, f32, f32, f32) {
        if self.animated_transform.is_none() && !self.view.has_transform {
            return (1.0, 1.0, 0.0, 0.0);
        }
        let m = self.animated_transform.unwrap_or(self.view.transform);
        let (scale_x, scale_y, translate_x, translate_y) = axis_aligned_transform(&m);
        if has_unsupported_subtree_transform(&m) {
            // Transforms can update on every animation frame. Keep unsupported
            // matrix diagnostics off the normal hot path and emit them only
            // when verbose transform tracing is requested.
            log::trace!(
                "[transform] tag={} has rotation/skew/perspective; GPUI subtree transform spike is not supported",
                self.tag
            );
        }
        (scale_x, scale_y, translate_x, translate_y)
    }

    /// Transform-aware frame origin in window coordinates. RN transforms are
    /// resolved by Fabric about the view's transform origin; this path folds
    /// axis-aligned scale and translation into Yoga bounds. Rotation/skew are
    /// deliberately logged for the §5.2 spike instead of silently approximated.
    pub fn absolute_origin(&self, cx: &App) -> Point<Pixels> {
        let mut chain = vec![OriginStep {
            frame: (self.frame.x, self.frame.y),
            transform: self.local_transform(),
            scroll: (self.scroll_offset.x, self.scroll_offset.y),
            is_scroll: self.component == "ScrollView",
        }];
        let mut parent = self.parent.clone();
        while let Some(weak) = parent {
            let Some(node) = weak.upgrade() else { break };
            let node = node.read(cx);
            chain.push(OriginStep {
                frame: (node.frame.x, node.frame.y),
                transform: node.local_transform(),
                scroll: (node.scroll_offset.x, node.scroll_offset.y),
                is_scroll: node.component == "ScrollView",
            });
            parent = node.parent.clone();
        }
        chain.reverse();
        let (x, y) = accumulate_origin(&chain);
        point(px(x), px(y))
    }

    pub(crate) fn cumulative_scale(&self, cx: &App) -> (f32, f32) {
        let mut sx = 1.0;
        let mut sy = 1.0;
        let mut parent = self.parent.clone();
        let mut chain = Vec::new();
        while let Some(weak) = parent {
            let Some(node) = weak.upgrade() else { break };
            let node = node.read(cx);
            chain.push(node.local_transform());
            parent = node.parent.clone();
        }
        chain.reverse();
        chain.push(self.local_transform());
        for (local_sx, local_sy, _, _) in chain {
            sx *= local_sx;
            sy *= local_sy;
        }
        (sx.abs(), sy.abs())
    }
}

fn role_for_accessibility_role(role: &str, accessible: bool) -> Option<Role> {
    Some(match role {
        "none" | "presentation" => return None,
        "button" | "imagebutton" | "togglebutton" => Role::Button,
        "image" => Role::Image,
        "link" => Role::Link,
        "header" => Role::Heading,
        "adjustable" => Role::Slider,
        "dropdownlist" | "combobox" => Role::ComboBox,
        "keyboardkey" => Role::Keyboard,
        "checkbox" => Role::CheckBox,
        "radio" => Role::RadioButton,
        "radiogroup" => Role::RadioGroup,
        "switch" => Role::Switch,
        "search" => Role::SearchInput,
        // AccessKit maps Label to the platform's static-text role; TextInput
        // would incorrectly announce read-only RN text as an editable field.
        "text" => Role::Label,
        "summary" => Role::Note,
        "toolbar" => Role::Toolbar,
        "menu" | "iconmenu" => Role::Menu,
        "menubar" => Role::MenuBar,
        "menuitem" => Role::MenuItem,
        "progressbar" => Role::ProgressIndicator,
        "scrollbar" => Role::ScrollBar,
        "tab" => Role::Tab,
        "tabbar" => Role::TabPanel,
        "tablist" => Role::TabList,
        "timer" => Role::Timer,
        "alert" => Role::Alert,
        "dialog" => Role::Dialog,
        "list" => Role::List,
        "listitem" => Role::ListItem,
        "grid" => Role::Grid,
        "row" => Role::Row,
        "cell" => Role::Cell,
        "table" => Role::Table,
        "paragraph" => Role::Paragraph,
        "label" => Role::Label,
        "pager" | "scrollview" | "horizontalscrollview" => Role::ScrollView,
        "viewgroup" | "slidingdrawer" => Role::Group,
        "drawerlayout" => Role::Pane,
        "webview" => Role::WebView,
        "spinbutton" => Role::SpinButton,
        _ if !role.is_empty() || accessible => Role::Group,
        _ => return None,
    })
}

#[cfg(test)]
mod accessibility_role_tests {
    use super::role_for_accessibility_role;
    use gpui::Role;

    #[test]
    fn maps_react_native_087_roles_to_accesskit_roles() {
        for (rn_role, expected) in [
            ("button", Role::Button),
            ("dropdownlist", Role::ComboBox),
            ("togglebutton", Role::Button),
            ("link", Role::Link),
            ("search", Role::SearchInput),
            ("image", Role::Image),
            ("keyboardkey", Role::Keyboard),
            ("text", Role::Label),
            ("adjustable", Role::Slider),
            ("imagebutton", Role::Button),
            ("header", Role::Heading),
            ("summary", Role::Note),
            ("alert", Role::Alert),
            ("checkbox", Role::CheckBox),
            ("combobox", Role::ComboBox),
            ("menu", Role::Menu),
            ("menubar", Role::MenuBar),
            ("menuitem", Role::MenuItem),
            ("progressbar", Role::ProgressIndicator),
            ("radio", Role::RadioButton),
            ("radiogroup", Role::RadioGroup),
            ("scrollbar", Role::ScrollBar),
            ("spinbutton", Role::SpinButton),
            ("switch", Role::Switch),
            ("tab", Role::Tab),
            ("tabbar", Role::TabPanel),
            ("tablist", Role::TabList),
            ("timer", Role::Timer),
            ("list", Role::List),
            ("toolbar", Role::Toolbar),
            ("grid", Role::Grid),
            ("pager", Role::ScrollView),
            ("scrollview", Role::ScrollView),
            ("horizontalscrollview", Role::ScrollView),
            ("viewgroup", Role::Group),
            ("webview", Role::WebView),
            ("drawerlayout", Role::Pane),
            ("slidingdrawer", Role::Group),
            ("iconmenu", Role::Menu),
            ("listitem", Role::ListItem),
            ("row", Role::Row),
            ("cell", Role::Cell),
            ("table", Role::Table),
            ("paragraph", Role::Paragraph),
            ("label", Role::Label),
        ] {
            assert_eq!(
                role_for_accessibility_role(rn_role, false),
                Some(expected),
                "{rn_role}"
            );
        }
    }

    #[test]
    fn presentation_and_unknown_roles_keep_their_accessibility_semantics() {
        assert_eq!(role_for_accessibility_role("none", true), None);
        assert_eq!(role_for_accessibility_role("presentation", true), None);
        assert_eq!(
            role_for_accessibility_role("unknown", false),
            Some(Role::Group)
        );
        assert_eq!(
            role_for_accessibility_role("unknown", true),
            Some(Role::Group)
        );
    }
}

#[derive(Clone, Copy)]
struct OriginStep {
    frame: (f32, f32),
    transform: (f32, f32, f32, f32),
    scroll: (f32, f32),
    is_scroll: bool,
}

fn accumulate_origin(chain: &[OriginStep]) -> (f32, f32) {
    let (mut x, mut y, mut scale_x, mut scale_y) = (0.0f32, 0.0f32, 1.0f32, 1.0f32);
    let mut parent_scroll = (0.0f32, 0.0f32);
    for step in chain {
        let (local_scale_x, local_scale_y, translate_x, translate_y) = step.transform;
        x += scale_x * (step.frame.0 - parent_scroll.0 + translate_x);
        y += scale_y * (step.frame.1 - parent_scroll.1 + translate_y);
        scale_x *= local_scale_x;
        scale_y *= local_scale_y;
        parent_scroll = if step.is_scroll {
            step.scroll
        } else {
            (0.0, 0.0)
        };
    }
    (x, y)
}

fn axis_aligned_transform(matrix: &[f32; 16]) -> (f32, f32, f32, f32) {
    if matrix.iter().any(|value| !value.is_finite()) {
        return (1.0, 1.0, 0.0, 0.0);
    }
    (matrix[0], matrix[5], matrix[12], matrix[13])
}

fn has_unsupported_subtree_transform(matrix: &[f32; 16]) -> bool {
    matrix.iter().any(|value| !value.is_finite())
        || [
            matrix[1], matrix[2], matrix[3], matrix[4], matrix[6], matrix[7], matrix[8], matrix[9],
            matrix[11], matrix[14],
        ]
        .into_iter()
        .any(|value| value.abs() > 0.0001)
        || matrix[0] < 0.0
        || matrix[5] < 0.0
        || (matrix[10] - 1.0).abs() > 0.0001
        || (matrix[15] - 1.0).abs() > 0.0001
}

#[cfg(test)]
mod transform_matrix_tests {
    use super::{
        accumulate_origin, axis_aligned_transform, has_unsupported_subtree_transform, OriginStep,
    };

    fn identity() -> [f32; 16] {
        [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ]
    }

    #[test]
    fn axis_aligned_matrix_keeps_translation_and_nonuniform_scale() {
        let mut matrix = identity();
        matrix[0] = 1.5;
        matrix[5] = 0.75;
        matrix[12] = 12.0;
        matrix[13] = -3.0;

        assert_eq!(axis_aligned_transform(&matrix), (1.5, 0.75, 12.0, -3.0));
        assert!(!has_unsupported_subtree_transform(&matrix));
    }

    #[test]
    fn rotation_is_flagged_for_the_documented_gpui_spike() {
        let mut matrix = identity();
        matrix[0] = 0.0;
        matrix[1] = 1.0;
        matrix[4] = -1.0;
        matrix[5] = 0.0;

        assert!(has_unsupported_subtree_transform(&matrix));
    }

    #[test]
    fn reflection_and_perspective_are_flagged() {
        let mut reflection = identity();
        reflection[0] = -1.0;
        assert!(has_unsupported_subtree_transform(&reflection));

        for perspective_index in [14, 15] {
            let mut perspective = identity();
            perspective[perspective_index] = if perspective_index == 15 { 0.5 } else { 0.01 };
            assert!(has_unsupported_subtree_transform(&perspective));
        }
    }

    #[test]
    fn nonfinite_transform_is_flagged() {
        let mut matrix = identity();
        matrix[12] = f32::NAN;
        assert!(has_unsupported_subtree_transform(&matrix));
        assert_eq!(axis_aligned_transform(&matrix), (1.0, 1.0, 0.0, 0.0));
    }

    #[test]
    fn nested_scaled_origins_apply_parent_scroll_and_translation() {
        let chain = [
            OriginStep {
                frame: (10.0, 20.0),
                transform: (2.0, 2.0, 3.0, 4.0),
                scroll: (5.0, 6.0),
                is_scroll: true,
            },
            OriginStep {
                frame: (30.0, 40.0),
                transform: (0.5, 0.5, 1.0, 2.0),
                scroll: (0.0, 0.0),
                is_scroll: false,
            },
        ];

        assert_eq!(accumulate_origin(&chain), (65.0, 96.0));
    }
}

impl RNNodeView {
    pub(crate) fn sync_input_paragraph(&mut self) {
        let show_placeholder = self.input_text.is_empty();
        let visible = if show_placeholder {
            &self.input_placeholder
        } else {
            &self.input_text
        };
        let Some(paragraph) = self.paragraph.as_mut() else {
            return;
        };
        if paragraph.fragments.is_empty() {
            if visible.is_empty() {
                return;
            }
            paragraph
                .fragments
                .push(rn_gpui_sys::ffi::TextFragmentFlat {
                    text: visible.clone(),
                    font_family: String::new(),
                    font_size: 14.0,
                    font_weight: 400,
                    italic: false,
                    color: if show_placeholder {
                        0xff8e8e93
                    } else {
                        self.input_text_color
                    },
                    line_height: 0.0,
                    letter_spacing: 0.0,
                    underline: false,
                    strikethrough: false,
                });
        } else {
            paragraph.fragments[0].text = visible.clone();
            if show_placeholder && !self.input_placeholder_mode {
                self.input_text_color = paragraph.fragments[0].color;
            }
            paragraph.fragments[0].color = if show_placeholder {
                0xff8e8e93
            } else if self.input_placeholder_mode {
                self.input_text_color
            } else {
                paragraph.fragments[0].color
            };
            paragraph.fragments.truncate(1);
        }
        self.input_placeholder_mode = show_placeholder;
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
        self.render_count += 1;
        if debug_render_counts_enabled() {
            log::info!(
                "[retention] RNNodeView::render elapsed_ms={} tag={} component={} count={}",
                elapsed_since_first_render_ms(),
                self.tag,
                self.component,
                self.render_count
            );
        }
        if self.component == "ModalHostView" && !self.modal_visible {
            return div().id(self.tag).size_0();
        }
        #[cfg(target_os = "macos")]
        if self.component == "NativeViewHost" && !self.native_view_name.is_empty() {
            if self.native_view_host.is_none() {
                match crate::native_view::NativeViewSurface::create(
                    &self.native_view_name,
                    &self.native_view_props,
                    window,
                    cx,
                ) {
                    Ok(host) => self.native_view_host = Some(std::rc::Rc::new(host)),
                    Err(error) => log::error!(
                        "[native-view] tag {} ({}) initialization failed: {error:#}",
                        self.tag,
                        self.native_view_name
                    ),
                }
            }
        }
        let frame = self.frame;
        let (scale_x, scale_y) = self.cumulative_scale(cx);
        // Yoga's child frames already include the parent's border inset.
        // GPUI/Taffy positions absolute children inside that border as well;
        // compensate once so a pressed/focused RN border does not move content
        // twice (and keep native hit coordinates aligned with the pixels).
        let (parent_border_left, parent_border_top) = self
            .parent
            .as_ref()
            .and_then(|parent| parent.upgrade())
            .map(|parent| {
                let parent = parent.read(cx);
                let (parent_scale_x, parent_scale_y) = parent.cumulative_scale(cx);
                (
                    parent.view.border_widths.left * parent_scale_x,
                    parent.view.border_widths.top * parent_scale_y,
                )
            })
            .unwrap_or_default();
        let is_scroll = self.component == "ScrollView";
        let mut element = div().id(self.tag);
        if !self.view.test_id.is_empty() {
            element = element.accessibility_id(self.view.test_id.clone());
        }
        if !self.view.accessibility_label.is_empty() {
            element = element.aria_label(self.view.accessibility_label.clone());
        }
        if let Some(role) = self.accessibility_role() {
            element = element.role(role);
        }
        if self.view.accessible {
            if self.view.accessibility_disabled {
                // GPUI's Div builder omits a disabled setter, but the public
                // subtree hook exposes the generated AccessKit parent node.
                element = element.a11y_synthetic_children(|builder| {
                    builder.parent_node().set_disabled();
                });
            }
            if self.view.accessibility_selected {
                element = element.aria_selected(true);
            }
            if self.view.accessibility_expanded >= 0 {
                element = element.aria_expanded(self.view.accessibility_expanded != 0);
            }
            element = match self.view.accessibility_checked {
                1 => element.aria_toggled(gpui::Toggled::False),
                2 => element.aria_toggled(gpui::Toggled::True),
                3 => element.aria_toggled(gpui::Toggled::Mixed),
                _ => element,
            };
        }
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
                    let is_text_input = self.component == "TextInput";
                    let focused_host = host.clone();
                    self.focus_subscriptions.push(cx.on_focus(
                        &handle,
                        window,
                        move |this, window, cx| {
                            if is_text_input {
                                this.start_caret_blink(cx);
                            }
                            focused_host.dispatch_event(
                                tag,
                                if is_text_input { "topFocus" } else { "focus" },
                                &serde_json::json!({
                                    "focusVisible": window.last_input_was_keyboard(),
                                }),
                            );
                            if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                                store.0.read(cx).frame_hook.arm(window);
                            }
                        },
                    ));
                    self.focus_subscriptions.push(cx.on_blur(
                        &handle,
                        window,
                        move |this, window, cx| {
                            if is_text_input {
                                this.stop_caret_blink();
                                cx.notify();
                            }
                            host.dispatch_event(
                                tag,
                                if is_text_input { "topBlur" } else { "blur" },
                                &serde_json::json!({}),
                            );
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
                    if this.component == "TextInput"
                        && crate::input::handle_key(
                            this,
                            &event.keystroke.key,
                            event.keystroke.modifiers.shift,
                            window,
                            cx,
                        )
                    {
                        cx.stop_propagation();
                    }
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
            if let Some(focus) = self.pending_text_input_focus.take() {
                if let Some(handle) = self.focus_handle.as_ref() {
                    if focus {
                        handle.focus(window, cx);
                    } else if handle.is_focused(window) {
                        window.blur(cx);
                    }
                }
            }
        }
        if self.component == "ModalHostView" && self.modal_visible {
            element = element.on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" {
                    if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                        let store = store.0.read(cx);
                        store.host.dispatch_event(
                            this.tag,
                            "topRequestClose",
                            &serde_json::json!({}),
                        );
                        store.frame_hook.arm(window);
                    }
                    cx.stop_propagation();
                }
            }));
        }
        // Replace the whole style: cached paint fields + the absolute Yoga
        // frame. Nothing flex-related is ever set (see the module docs).
        *element.style() = {
            let mut style = self.cached_style.clone();
            let radius_scale = scale_x.min(scale_y);
            style.corner_radii.top_left = Some(px(self.view.border_radii.tl * radius_scale).into());
            style.corner_radii.top_right =
                Some(px(self.view.border_radii.tr * radius_scale).into());
            style.corner_radii.bottom_right =
                Some(px(self.view.border_radii.br * radius_scale).into());
            style.corner_radii.bottom_left =
                Some(px(self.view.border_radii.bl * radius_scale).into());
            if let Some(shadows) = style.box_shadow.as_mut() {
                for shadow in shadows {
                    shadow.offset.x = px(f32::from(shadow.offset.x) * scale_x);
                    shadow.offset.y = px(f32::from(shadow.offset.y) * scale_y);
                    shadow.blur_radius = px(f32::from(shadow.blur_radius) * radius_scale);
                    shadow.spread_radius = px(f32::from(shadow.spread_radius) * radius_scale);
                }
            }
            style.position = Some(Position::Absolute);
            let local_origin = self.absolute_origin(cx);
            let parent_origin = self
                .parent
                .as_ref()
                .and_then(|p| p.upgrade())
                .map(|p| p.read(cx).absolute_origin(cx))
                .unwrap_or_default();
            style.inset.left =
                Some((local_origin.x - parent_origin.x - px(parent_border_left)).into());
            style.inset.top =
                Some((local_origin.y - parent_origin.y - px(parent_border_top)).into());
            style.size.width = Some(px(frame.w * scale_x).into());
            style.size.height = Some(px(frame.h * scale_y).into());
            style
        };
        #[cfg(target_os = "macos")]
        if let Some(native_view_host) = &self.native_view_host {
            element = element.child(crate::native_view::NativeViewSurfaceElement {
                surface: native_view_host.clone(),
            });
        }
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
                        if this.component == "TextInput" {
                            if event.click_count >= 2 {
                                crate::input::select_all(this, window, cx);
                            } else {
                                crate::input::select_at_point(
                                    this,
                                    event.position,
                                    false,
                                    window,
                                    cx,
                                );
                            }
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
                        if this.component == "TextInput" && this.input_selection_anchor.is_some() {
                            crate::input::select_at_point(this, event.position, true, window, cx);
                        }
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
            let mut scaled_paragraph = paragraph.clone();
            for fragment in &mut scaled_paragraph.fragments {
                fragment.font_size *= scale_y;
                fragment.line_height *= scale_y;
                fragment.letter_spacing *= scale_x;
            }
            if self.component == "TextInput" {
                let left = self.view.content_insets.left * scale_x;
                let top = self.view.content_insets.top * scale_y;
                let right = self.view.content_insets.right * scale_x;
                let bottom = self.view.content_insets.bottom * scale_y;
                element = element.child(
                    div()
                        .absolute()
                        .left(px(left))
                        .top(px(top))
                        .w(px((frame.w * scale_x - left - right).max(0.0)))
                        .h(px((frame.h * scale_y - top - bottom).max(0.0)))
                        .child(crate::text::paragraph_element(
                            &scaled_paragraph,
                            (frame.w * scale_x - left - right).max(0.0),
                            (frame.h * scale_y - top - bottom).max(0.0),
                        )),
                );
            } else {
                element = element.child(crate::text::paragraph_element(
                    &scaled_paragraph,
                    frame.w * scale_x,
                    frame.h * scale_y,
                ));
            }
        }
        if self.component == "TextInput" {
            let input = cx.entity();
            let focus = self.focus_handle.clone();
            let caret_text = self.input_text.clone();
            let caret_offset = self.input_selection.end.min(self.input_text.len());
            let caret_paragraph = self.paragraph.clone().unwrap_or_default();
            let input_selection = self.input_selection.clone();
            let content_insets = self.view.content_insets;
            let input_text_color = self.input_text_color;
            let input_selection_color = self.input_selection_color;
            let caret_visible = self.caret_visible;
            let caret_height = self
                .paragraph
                .as_ref()
                .and_then(|paragraph| paragraph.fragments.first())
                .map(|fragment| {
                    if fragment.line_height > 0.0 {
                        fragment.line_height * scale_y
                    } else {
                        fragment.font_size.max(14.0) * scale_y * 1.2
                    }
                })
                .unwrap_or(17.0 * scale_y);
            element = element.child(
                div().absolute().top_0().left_0().size_full().child(
                    gpui::canvas(
                        |_bounds, _window, _cx| (),
                        move |bounds, _state, window, cx| {
                            if focus.as_ref().is_some_and(|f| f.is_focused(window)) {
                                if !input_selection.is_empty() {
                                    let start = input_selection.start.min(caret_text.len());
                                    let end = input_selection.end.min(caret_text.len());
                                    let content_width = f32::from(bounds.size.width)
                                        - (content_insets.left + content_insets.right) * scale_x;
                                    let mut line_start = 0;
                                    for (line_number, raw_line) in
                                        caret_text.split_inclusive('\n').enumerate()
                                    {
                                        let line = raw_line.trim_end_matches('\n');
                                        let line_end = line_start + line.len();
                                        let selected_start = start.max(line_start).min(line_end);
                                        let selected_end = end.min(line_end).max(selected_start);
                                        let includes_newline = end > line_end
                                            && start <= line_end
                                            && raw_line.ends_with('\n');
                                        if selected_end > selected_start || includes_newline {
                                            let prefix = &line[..selected_start - line_start];
                                            let through_selection =
                                                &line[..selected_end - line_start];
                                            let x0 = crate::text::input_caret_x(
                                                window.text_system(),
                                                &caret_paragraph,
                                                prefix,
                                                prefix.len(),
                                            );
                                            let x1 = crate::text::input_caret_x(
                                                window.text_system(),
                                                &caret_paragraph,
                                                through_selection,
                                                through_selection.len(),
                                            );
                                            let width = if includes_newline {
                                                (content_width - x0).max(1.0)
                                            } else {
                                                (x1 - x0).max(1.0)
                                            };
                                            let selection = gpui::Bounds {
                                                origin: point(
                                                    bounds.origin.x
                                                        + px(content_insets.left * scale_x + x0),
                                                    bounds.origin.y
                                                        + px(content_insets.top * scale_y
                                                            + line_number as f32 * caret_height),
                                                ),
                                                size: gpui::size(px(width), px(caret_height)),
                                            };
                                            window.paint_quad(gpui::fill(
                                                selection,
                                                gpui::rgba(0x3875d788),
                                            ));
                                        }
                                        line_start += raw_line.len();
                                    }
                                }
                                if caret_visible {
                                    let offset = caret_offset.min(caret_text.len());
                                    let safe_offset = (0..=offset)
                                        .rev()
                                        .find(|index| caret_text.is_char_boundary(*index))
                                        .unwrap_or(0);
                                    let prefix = &caret_text[..safe_offset];
                                    let line = prefix.rsplit('\n').next().unwrap_or(prefix);
                                    let line_number =
                                        prefix.bytes().filter(|byte| *byte == b'\n').count();
                                    let x = crate::text::input_caret_x(
                                        window.text_system(),
                                        &caret_paragraph,
                                        line,
                                        line.len(),
                                    );
                                    let x = bounds.origin.x + px(content_insets.left * scale_x + x);
                                    let y = bounds.origin.y
                                        + px(content_insets.top * scale_y
                                            + line_number as f32 * caret_height);
                                    let caret = gpui::Bounds {
                                        origin: point(x, y),
                                        size: gpui::size(px(scale_x.max(1.0)), px(caret_height)),
                                    };
                                    // Honor RN's selectionColor for the caret;
                                    // otherwise match the text foreground. A
                                    // fixed black caret disappears on dark
                                    // surfaces with light text.
                                    let caret_color = if input_selection_color == 0 {
                                        input_text_color
                                    } else {
                                        input_selection_color
                                    };
                                    window.paint_quad(gpui::fill(
                                        caret,
                                        crate::style::color(caret_color),
                                    ));
                                }
                            }
                            if let Some(focus) = focus.as_ref() {
                                window.handle_input(
                                    focus,
                                    gpui::ElementInputHandler::new(bounds, input.clone()),
                                    cx,
                                );
                            }
                        },
                    )
                    .size_full(),
                ),
            );
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
        } else {
            element = element.children(self.children.iter().map(|(_, child)| child.clone()));
        }
        let width = frame.w * scale_x;
        let height = frame.h * scale_y;
        let edges = [
            (
                0,
                0.0,
                0.0,
                height,
                self.view.border_widths.left * scale_x,
                false,
            ),
            (
                1,
                0.0,
                0.0,
                width,
                self.view.border_widths.top * scale_y,
                true,
            ),
            (
                2,
                width - self.view.border_widths.right * scale_x,
                0.0,
                height,
                self.view.border_widths.right * scale_x,
                false,
            ),
            (
                3,
                0.0,
                height - self.view.border_widths.bottom * scale_y,
                width,
                self.view.border_widths.bottom * scale_y,
                true,
            ),
        ];
        let mut border_rules = Vec::new();
        for (edge, x, y, length, thickness, horizontal) in edges {
            let color = self.view.border_colors[edge];
            if color != 0 && thickness > 0.0 {
                border_rules.extend(rule_segments(
                    x,
                    y,
                    length,
                    thickness,
                    horizontal,
                    color,
                    self.view.border_styles[edge],
                ));
            }
        }
        if !border_rules.is_empty() {
            let mut border_clip = div()
                .absolute()
                .top_0()
                .left_0()
                .size_full()
                .overflow_hidden();
            {
                let radii = &mut border_clip.style().corner_radii;
                radii.top_left = Some(px(self.view.border_radii.tl * scale_x.min(scale_y)).into());
                radii.top_right = Some(px(self.view.border_radii.tr * scale_x.min(scale_y)).into());
                radii.bottom_right =
                    Some(px(self.view.border_radii.br * scale_x.min(scale_y)).into());
                radii.bottom_left =
                    Some(px(self.view.border_radii.bl * scale_x.min(scale_y)).into());
            }
            element = element.child(border_clip.children(border_rules));
        }
        let mut outline_rules = Vec::new();
        if self.view.outline_color != 0 && self.view.outline_width > 0.0 {
            let outline_width_x = self.view.outline_width * scale_x;
            let outline_width_y = self.view.outline_width * scale_y;
            let offset_x = self.view.outline_offset * scale_x;
            let offset_y = self.view.outline_offset * scale_y;
            let x = -offset_x - outline_width_x;
            let y = -offset_y - outline_width_y;
            outline_rules.extend(rule_segments(
                x,
                y,
                width + 2.0 * offset_x,
                outline_width_y,
                true,
                self.view.outline_color,
                self.view.outline_style,
            ));
            outline_rules.extend(rule_segments(
                x,
                height + offset_y,
                width + 2.0 * offset_x,
                outline_width_y,
                true,
                self.view.outline_color,
                self.view.outline_style,
            ));
            outline_rules.extend(rule_segments(
                x,
                y + outline_width_y,
                height + 2.0 * offset_y,
                outline_width_x,
                false,
                self.view.outline_color,
                self.view.outline_style,
            ));
            outline_rules.extend(rule_segments(
                width + offset_x,
                y + outline_width_y,
                height + 2.0 * offset_y,
                outline_width_x,
                false,
                self.view.outline_color,
                self.view.outline_style,
            ));
        }
        element.children(outline_rules)
    }
}

fn rule_segments(
    x: f32,
    y: f32,
    length: f32,
    thickness: f32,
    horizontal: bool,
    argb: u32,
    style: u8,
) -> Vec<gpui::Div> {
    let mut rules = Vec::new();
    for (offset, painted) in rule_segment_spans(length, thickness, style) {
        let (left, top, width, height) = if horizontal {
            (x + offset, y, painted, thickness)
        } else {
            (x, y + offset, thickness, painted)
        };
        rules.push(
            div()
                .absolute()
                .left(px(left))
                .top(px(top))
                .w(px(width))
                .h(px(height))
                .bg(style::color(argb)),
        );
    }
    rules
}

fn rule_segment_spans(length: f32, thickness: f32, style: u8) -> Vec<(f32, f32)> {
    if !length.is_finite() || !thickness.is_finite() || length <= 0.0 || thickness <= 0.0 {
        return Vec::new();
    }
    let (segment, gap) = match style {
        1 => (thickness, thickness),
        2 => (thickness * 3.0, thickness * 2.0),
        _ => (length, 0.0),
    };
    let mut spans = Vec::new();
    let mut offset = 0.0;
    while offset < length {
        let painted = segment.min(length - offset);
        spans.push((offset, painted));
        offset += painted + gap;
    }
    spans
}

#[cfg(test)]
mod border_segment_tests {
    use super::rule_segment_spans;

    #[test]
    fn solid_rule_is_one_segment() {
        assert_eq!(rule_segment_spans(25.0, 3.0, 0), vec![(0.0, 25.0)]);
    }

    #[test]
    fn dotted_and_dashed_rules_clamp_the_last_segment() {
        assert_eq!(
            rule_segment_spans(10.0, 3.0, 1),
            vec![(0.0, 3.0), (6.0, 3.0)]
        );
        assert_eq!(
            rule_segment_spans(20.0, 3.0, 2),
            vec![(0.0, 9.0), (15.0, 5.0)]
        );
    }

    #[test]
    fn nonpositive_or_nonfinite_geometry_is_empty() {
        assert!(rule_segment_spans(0.0, 2.0, 2).is_empty());
        assert!(rule_segment_spans(2.0, 0.0, 2).is_empty());
        assert!(rule_segment_spans(f32::INFINITY, 2.0, 2).is_empty());
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
