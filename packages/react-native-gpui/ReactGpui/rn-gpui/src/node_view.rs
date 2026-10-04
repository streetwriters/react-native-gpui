//! One GPUI view per Fabric node (design doc §18.13).
//!
//! Phase 1 uses a GPUI `div()` **only** for absolute position, size and paint
//! styles. No flex properties are ever set, so Taffy cannot disagree with Yoga:
//! every frame comes from RN's Yoga pass.

use crate::style;
use gpui::{
    div, point, prelude::*, px, App, Context, Display, Entity, Fill, FocusHandle, IntoElement,
    KeyDownEvent, KeyUpEvent, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels,
    Point, Position, Role, StyleRefinement, Subscription, Task, WeakEntity, Window,
};
use rn_gpui_sys::ffi::{MountOp, ParagraphFlat, RectF, ViewPropsFlat};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ScreenTransitionMode {
    Fade,
    SlideFromRight,
    SlideFromLeft,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum ScreenTransitionRole {
    Enter,
    Exit,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct ScreenTransition {
    pub mode: ScreenTransitionMode,
    pub role: ScreenTransitionRole,
    pub started_at: Instant,
    pub duration: Duration,
    pub distance_factor: f32,
}

pub(crate) fn screen_transition_mode(animation: &str) -> Option<ScreenTransitionMode> {
    match animation {
        "none" => None,
        "slide_from_right" | "simple_push" => Some(ScreenTransitionMode::SlideFromRight),
        "slide_from_left" => Some(ScreenTransitionMode::SlideFromLeft),
        // Desktop's fallback is the short, unobtrusive fade described in the
        // native-stack support plan.
        "default" | "" | "fade" => Some(ScreenTransitionMode::Fade),
        _ => Some(ScreenTransitionMode::Fade),
    }
}

#[cfg(test)]
mod screen_transition_tests {
    use super::{screen_transition_mode, ScreenTransitionMode};

    #[test]
    fn maps_supported_native_stack_animations_and_fallbacks() {
        assert_eq!(screen_transition_mode("none"), None);
        assert_eq!(
            screen_transition_mode("fade"),
            Some(ScreenTransitionMode::Fade)
        );
        assert_eq!(
            screen_transition_mode("default"),
            Some(ScreenTransitionMode::Fade)
        );
        assert_eq!(screen_transition_mode(""), Some(ScreenTransitionMode::Fade));
        assert_eq!(
            screen_transition_mode("slide_from_right"),
            Some(ScreenTransitionMode::SlideFromRight)
        );
        assert_eq!(
            screen_transition_mode("simple_push"),
            Some(ScreenTransitionMode::SlideFromRight)
        );
        assert_eq!(
            screen_transition_mode("slide_from_left"),
            Some(ScreenTransitionMode::SlideFromLeft)
        );
        assert_eq!(
            screen_transition_mode("unsupported"),
            Some(ScreenTransitionMode::Fade)
        );
    }
}

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
    animated_background_color: Option<u32>,
    animated_text_color: Option<u32>,
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
    pub screen_header_title: String,
    pub(crate) screen_header_subview_type: String,
    pub(crate) header_container_width: f32,
    pub(crate) header_subview_content_height: f32,
    screen_header_background_color: u32,
    screen_header_title_color: u32,
    screen_header_tint_color: u32,
    pub(crate) screen_header_hidden: bool,
    screen_header_hide_back: bool,
    pub(crate) screen_header_has_title_subview: bool,
    pub(crate) screen_content_wrapper_header_hidden: bool,
    pub(crate) hidden_header_ancestor: bool,
    pub(crate) screen_activity_state: f32,
    pub(crate) screen_stack_animation: String,
    pub(crate) screen_stack_presentation: String,
    pub(crate) screen_transition: Option<ScreenTransition>,
    screen_progress_emitted: Option<(Instant, f32)>,
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

    pub fn set_animated_background_color(&mut self, color: u32) {
        self.animated_background_color = Some(color);
    }

    pub fn set_animated_text_color(&mut self, color: u32) {
        self.animated_text_color = Some(color);
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
            frame: if matches!(
                op.component.as_str(),
                "ModalHostView" | "RNSFullWindowOverlay"
            ) {
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
            animated_background_color: None,
            animated_text_color: None,
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
            screen_header_title: op.screen_header_title.clone(),
            screen_header_subview_type: op.screen_header_subview_type.clone(),
            header_container_width: 0.0,
            header_subview_content_height: 0.0,
            screen_header_background_color: op.screen_header_background_color,
            screen_header_title_color: op.screen_header_title_color,
            screen_header_tint_color: op.screen_header_tint_color,
            screen_header_hidden: op.screen_header_hidden,
            screen_header_hide_back: op.screen_header_hide_back,
            screen_header_has_title_subview: false,
            screen_content_wrapper_header_hidden: false,
            hidden_header_ancestor: false,
            screen_activity_state: op.screen_activity_state,
            screen_stack_animation: op.screen_stack_animation.clone(),
            screen_stack_presentation: op.screen_stack_presentation.clone(),
            screen_transition: None,
            screen_progress_emitted: None,
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
        self.frame = if matches!(
            self.component.as_str(),
            "ModalHostView" | "RNSFullWindowOverlay"
        ) {
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
        self.screen_header_title = op.screen_header_title.clone();
        self.screen_header_subview_type = op.screen_header_subview_type.clone();
        self.screen_header_background_color = op.screen_header_background_color;
        self.screen_header_title_color = op.screen_header_title_color;
        self.screen_header_tint_color = op.screen_header_tint_color;
        self.screen_header_hidden = op.screen_header_hidden;
        self.screen_header_hide_back = op.screen_header_hide_back;
        self.screen_activity_state = op.screen_activity_state;
        self.screen_stack_animation = op.screen_stack_animation.clone();
        self.screen_stack_presentation = op.screen_stack_presentation.clone();
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
    fn origin_frame(&self, cx: &App) -> (f32, f32) {
        let mut own_frame = (self.frame.x, self.frame.y);
        if self.component == "RNSScreenStackHeaderConfig" {
            own_frame.1 += cx
                .try_global::<crate::store::StoreGlobal>()
                .map(|store| store.0.read(cx).top_inset)
                .unwrap_or(0.0);
        }

        if self.component == "RNSScreenContentWrapper" && self.screen_content_wrapper_header_hidden
        {
            own_frame.1 -= 56.0;
        }
        if self.component == "RNSScreenStackHeaderSubview" {
            own_frame.0 = match self.screen_header_subview_type.as_str() {
                "right" => self.header_container_width - self.frame.w - 12.0,
                "center" | "title" => (self.header_container_width - self.frame.w) / 2.0,
                "left" => 12.0,
                _ => self.frame.x,
            };
            own_frame.1 = (56.0 - self.header_subview_content_height).max(0.0) / 2.0;
        }
        own_frame
    }

    pub fn absolute_origin(&self, cx: &App) -> Point<Pixels> {
        let mut chain = vec![OriginStep {
            frame: self.origin_frame(cx),
            transform: self.local_transform(),
            scroll: (self.scroll_offset.x, self.scroll_offset.y),
            is_scroll: self.component == "ScrollView",
        }];
        let mut parent = self.parent.clone();
        while let Some(weak) = parent {
            let Some(node) = weak.upgrade() else { break };
            let node = node.read(cx);
            chain.push(OriginStep {
                frame: node.origin_frame(cx),
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

    fn is_top_stack_header(&self, cx: &App) -> bool {
        let mut ancestor = self.parent.clone();
        let mut screen = None;
        while let Some(entity) = ancestor.and_then(|weak| weak.upgrade()) {
            let node = entity.read(cx);
            if node.component == "RNSScreen" {
                let screen_active = node.screen_activity_state > 0.0;
                let transition_active = node.screen_transition.is_some_and(|transition| {
                    !cx.reduce_motion()
                        && Instant::now() - transition.started_at < transition.duration
                });
                screen = Some((
                    node.tag,
                    node.parent.clone(),
                    screen_active || transition_active,
                ));
                break;
            }
            ancestor = node.parent.clone();
        }

        let Some((screen_tag, Some(stack_parent), transition_active)) = screen else {
            return true;
        };
        let Some(stack) = stack_parent.upgrade() else {
            return true;
        };
        let stack = stack.read(cx);
        if stack.component != "RNSScreenStack" {
            return true;
        }
        transition_active
            || stack
                .children
                .iter()
                .rposition(|(tag, _)| *tag == screen_tag)
                == Some(stack.children.len().saturating_sub(1))
    }

    pub(crate) fn has_screen_ancestor(&self, cx: &App) -> bool {
        let mut ancestor = self.parent.clone();
        while let Some(entity) = ancestor.and_then(|weak| weak.upgrade()) {
            let node = entity.read(cx);
            if node.component == "RNSScreen" {
                return true;
            }
            ancestor = node.parent.clone();
        }
        false
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
        if self.view.display_none || (self.component == "ModalHostView" && !self.modal_visible) {
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
        let mut frame = self.frame;
        if self.component == "RNSScreenContentWrapper" && self.screen_content_wrapper_header_hidden
        {
            frame.h += 56.0;
        }
        let hidden_stack_header =
            self.component == "RNSScreenStackHeaderConfig" && !self.is_top_stack_header(cx);
        let hidden_header = self.screen_header_hidden || self.hidden_header_ancestor;
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
        let local_origin = self.absolute_origin(cx);
        let parent_origin = self
            .parent
            .as_ref()
            .and_then(|parent| parent.upgrade())
            .map(|parent| parent.read(cx).absolute_origin(cx))
            .unwrap_or_default();
        let base_left = f32::from(local_origin.x - parent_origin.x) - parent_border_left;
        let base_top = f32::from(local_origin.y - parent_origin.y) - parent_border_top;
        let transition = if cx.reduce_motion() {
            None
        } else {
            self.screen_transition
        };
        let transition_progress = transition.map(|transition| {
            let duration = transition.duration.as_secs_f32().max(f32::EPSILON);
            let linear =
                ((Instant::now() - transition.started_at).as_secs_f32() / duration).clamp(0.0, 1.0);
            linear * linear * (3.0 - 2.0 * linear)
        });
        if self.component == "RNSScreen" {
            if let (Some(transition), Some(progress), Some(store)) = (
                transition,
                transition_progress,
                cx.try_global::<crate::store::StoreGlobal>(),
            ) {
                let going_forward = matches!(transition.role, ScreenTransitionRole::Enter)
                    || transition.distance_factor < 1.0;
                let sample = (transition.started_at, progress);
                if self.screen_progress_emitted != Some(sample) {
                    self.screen_progress_emitted = Some(sample);
                    let host = &store.0.read(cx).host;
                    host.dispatch_event(
                        self.tag,
                        "topTransitionProgress",
                        &serde_json::json!({
                            "progress": progress, "closing": if going_forward {0} else {1},
                            "goingForward": if going_forward {1} else {0}
                        }),
                    );
                    host.on_render();
                }
            }
        }
        if self.component == "RNSScreen" && std::env::var_os("RN_GPUI_DEBUG_SCREENS").is_some() {
            if let (Some(transition), Some(progress)) = (transition, transition_progress) {
                log::info!(
                    "[screens] animation frame tag={} role={:?} progress={progress:.3}",
                    self.tag,
                    transition.role
                );
            }
        }
        if self.component == "RNSScreen"
            && transition_progress.is_some_and(|progress| progress < 1.0)
        {
            let node = cx.entity().downgrade();
            window.on_next_frame(move |_, cx| {
                let _ = node.update(cx, |_, cx| cx.notify());
            });
            window.request_animation_frame();
        }
        let is_scroll = self.component == "ScrollView";
        let mut element = div().id(self.tag);
        if self.component == "RNSScreenStack" {
            element = element.overflow_hidden();
        }
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
        if self.component == "RNSScreenStack" {
            element = element.on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                // Native-stack wraps each route's content in an implementation
                // RNSScreenStack too. Only the outer navigator stack owns Escape.
                if this.has_screen_ancestor(cx) {
                    return;
                }
                if event.keystroke.key != "escape" {
                    return;
                }
                let screen_tags = this
                    .children
                    .iter()
                    .filter_map(|(tag, child)| {
                        (child.read(cx).component == "RNSScreen"
                            && cx
                                .try_global::<crate::store::StoreGlobal>()
                                .is_some_and(|store| store.0.read(cx).nodes.contains_key(tag)))
                        .then_some(*tag)
                    })
                    .collect::<Vec<_>>();
                let top_screen_tag = screen_tags.last().copied();
                let previous_screen_tag = screen_tags.iter().rev().nth(1).copied();
                if let (Some(tag), Some(store)) =
                    (top_screen_tag, cx.try_global::<crate::store::StoreGlobal>())
                {
                    let store_entity = store.0.clone();
                    store_entity.update(cx, |store, cx| {
                        if store.native_dismiss_lifecycle_pending.is_some() {
                            return;
                        }
                        let screen = store.nodes.get(&tag).cloned();
                        let animation = screen
                            .as_ref()
                            .map(|screen| screen.read(cx).screen_stack_animation.clone())
                            .unwrap_or_default();
                        let mode = crate::node_view::screen_transition_mode(&animation)
                            .filter(|_| !cx.reduce_motion());
                        let duration = mode.map(|mode| match mode {
                            crate::node_view::ScreenTransitionMode::Fade => {
                                std::time::Duration::from_millis(150)
                            }
                            _ => std::time::Duration::from_millis(240),
                        });
                        crate::store::dispatch_screen_lifecycle_will(
                            &store.host,
                            Some(tag),
                            previous_screen_tag,
                        );
                        store.native_dismiss_lifecycle_pending = Some(tag);
                        if let (Some(mode), Some(duration), Some(screen)) = (mode, duration, screen)
                        {
                            let reverse_mode = match mode {
                                crate::node_view::ScreenTransitionMode::SlideFromRight => {
                                    crate::node_view::ScreenTransitionMode::SlideFromLeft
                                }
                                crate::node_view::ScreenTransitionMode::SlideFromLeft => {
                                    crate::node_view::ScreenTransitionMode::SlideFromRight
                                }
                                crate::node_view::ScreenTransitionMode::Fade => mode,
                            };
                            let started_at = Instant::now();
                            screen.update(cx, |screen, cx| {
                                screen.screen_transition = Some(ScreenTransition {
                                    mode: reverse_mode,
                                    role: ScreenTransitionRole::Exit,
                                    started_at,
                                    duration,
                                    distance_factor: 1.0,
                                });
                                cx.notify();
                            });
                            if let Some(previous) = previous_screen_tag
                                .and_then(|tag| store.nodes.get(&tag))
                                .cloned()
                            {
                                previous.update(cx, |previous, cx| {
                                    previous.screen_transition = None;
                                    cx.notify();
                                });
                            }
                        }
                        let host = store.host.clone();
                        store.frame_hook.arm(window);
                        if let Some(duration) = duration {
                            cx.spawn(async move |store, cx| {
                                cx.background_executor().timer(duration).await;
                                let _ = store.update(cx, |store, cx| {
                                    if let Some(screen) = store.nodes.get(&tag).cloned() {
                                        screen.update(cx, |screen, cx| {
                                            screen.screen_transition = None;
                                            cx.notify();
                                        });
                                    }
                                    host.dispatch_event(
                                        tag,
                                        "topTransitionProgress",
                                        &serde_json::json!({"progress": 1, "closing": 1, "goingForward": 0}),
                                    );
                                    crate::store::dispatch_screen_lifecycle_did(
                                        &host,
                                        Some(tag),
                                        previous_screen_tag,
                                    );
                                    host.dispatch_event(
                                        tag,
                                        "topDismissed",
                                        &serde_json::json!({ "dismissCount": 1 }),
                                    );
                                });
                            })
                            .detach();
                        } else {
                            crate::store::dispatch_screen_lifecycle_did(
                                &host,
                                Some(tag),
                                previous_screen_tag,
                            );
                            host.dispatch_event(
                                tag,
                                "topDismissed",
                                &serde_json::json!({ "dismissCount": 1 }),
                            );
                        }
                    });
                    cx.stop_propagation();
                }
            }));
        }
        // Replace the whole style: cached paint fields + the absolute Yoga
        // frame. Nothing flex-related is ever set (see the module docs).
        *element.style() = {
            let mut style = self.cached_style.clone();
            if let Some(color) = self.animated_background_color {
                style.background = Some(Fill::from(style::color(color)));
            }
            if self.component == "RNSScreenStackHeaderConfig" {
                let color = if self.screen_header_background_color == 0 {
                    0xff171923
                } else {
                    self.screen_header_background_color
                };
                style.background = Some(Fill::from(style::color(color)));
            }
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
            let transitioning_out = transition.is_some_and(|transition| {
                matches!(transition.role, ScreenTransitionRole::Exit)
                    && transition_progress.is_some_and(|progress| progress < 1.0)
            });
            let visible_under_modal = self.component == "RNSScreen"
                && self.screen_activity_state <= 0.0
                && self
                    .parent
                    .as_ref()
                    .and_then(|parent| parent.upgrade())
                    .is_some_and(|parent| {
                        let parent = parent.read(cx);
                        parent.component == "RNSScreenStack"
                            && parent
                                .children
                                .iter()
                                .skip_while(|(tag, _)| *tag != self.tag)
                                .skip(1)
                                .any(|(_, sibling)| {
                                    let sibling = sibling.read(cx);
                                    sibling.component == "RNSScreen"
                                        && sibling.screen_activity_state > 0.0
                                        && matches!(
                                            sibling.screen_stack_presentation.as_str(),
                                            "modal"
                                                | "transparentModal"
                                                | "containedModal"
                                                | "formSheet"
                                        )
                                })
                    });
            if self.component == "RNSScreen"
                && self.screen_activity_state <= 0.0
                && !transitioning_out
                && !visible_under_modal
            {
                style.display = Some(Display::None);
            } else if self.component == "RNSScreen" && transitioning_out {
                // react-native-screens may mark the outgoing Fabric view
                // inactive in the same commit that inserts its replacement.
                // Keep it paintable beneath the entering card until the
                // transition reaches its end frame.
                style.display = Some(Display::Flex);
            }
            if hidden_stack_header || hidden_header {
                style.display = Some(Display::None);
            }
            let mut transition_offset_x = 0.0;
            if self.component == "RNSScreen" {
                if let (Some(transition), Some(progress)) = (transition, transition_progress) {
                    let distance_factor = transition.distance_factor;
                    match (transition.mode, transition.role) {
                        (ScreenTransitionMode::Fade, ScreenTransitionRole::Enter) => {
                            style.opacity = Some(style.opacity.unwrap_or(1.0) * progress);
                        }
                        (ScreenTransitionMode::Fade, ScreenTransitionRole::Exit) => {
                            style.opacity = Some(style.opacity.unwrap_or(1.0) * (1.0 - progress));
                        }
                        (ScreenTransitionMode::SlideFromRight, ScreenTransitionRole::Enter)
                        | (ScreenTransitionMode::SlideFromLeft, ScreenTransitionRole::Enter) => {
                            let sign = if transition.mode == ScreenTransitionMode::SlideFromRight {
                                1.0
                            } else {
                                -1.0
                            };
                            transition_offset_x =
                                sign * distance_factor * frame.w * (1.0 - progress);
                        }
                        (ScreenTransitionMode::SlideFromRight, ScreenTransitionRole::Exit)
                        | (ScreenTransitionMode::SlideFromLeft, ScreenTransitionRole::Exit) => {
                            let sign = if transition.mode == ScreenTransitionMode::SlideFromRight {
                                -1.0
                            } else {
                                1.0
                            };
                            transition_offset_x = sign * distance_factor * frame.w * progress;
                        }
                    }
                }
            }
            style.inset.left = Some(px(base_left + transition_offset_x).into());
            style.inset.top = Some(px(base_top).into());
            style.size.width = Some(px(frame.w * scale_x).into());
            style.size.height = Some(px(frame.h * scale_y).into());
            style
        };
        if self.component == "RNSScreenStackHeaderConfig"
            && !self.screen_header_hidden
            && !hidden_stack_header
        {
            let mut ancestor = self.parent.clone();
            let mut screen_tag = None;
            let mut has_previous_screen = false;
            let mut stack_child_tag = None;
            while let Some(entity) = ancestor.and_then(|weak| weak.upgrade()) {
                let node = entity.read(cx);
                if node.component == "RNSScreenStack" {
                    if let Some(candidate_tag) = stack_child_tag {
                        let mut found_current = false;
                        for (tag, _) in &node.children {
                            if *tag == candidate_tag {
                                found_current = true;
                                break;
                            }
                            has_previous_screen = true;
                        }
                        has_previous_screen &= found_current;
                        screen_tag = Some(candidate_tag);
                    }
                    break;
                }
                if node.component == "RNSScreen" {
                    screen_tag = Some(node.tag);
                    if let Some(stack_entity) = node.parent.as_ref().and_then(|p| p.upgrade()) {
                        let stack = stack_entity.read(cx);
                        let mut found_current = false;
                        for (tag, child) in &stack.children {
                            if child.read(cx).component != "RNSScreen" {
                                continue;
                            }
                            if *tag == node.tag {
                                found_current = true;
                                break;
                            }
                            has_previous_screen = true;
                        }
                        has_previous_screen &= found_current;
                    }
                    break;
                }
                stack_child_tag = Some(node.tag);
                ancestor = node.parent.clone();
            }

            let title_color = if self.screen_header_title_color == 0 {
                0xffffffff
            } else {
                self.screen_header_title_color
            };
            if !self.screen_header_has_title_subview {
                element = element.child(
                    div()
                        .absolute()
                        .top_0()
                        .left_0()
                        .size_full()
                        .flex()
                        .items_center()
                        .justify_center()
                        .text_color(style::color(title_color))
                        .text_size(px(18.0))
                        .child(self.screen_header_title.clone()),
                );
            }

            if has_previous_screen && !self.screen_header_hide_back {
                if let Some(screen_tag) = screen_tag {
                    element = element.child(
                        div()
                            .absolute()
                            .left_0()
                            .top_0()
                            .h(px(56.0))
                            .w(px(56.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_color(style::color(if self.screen_header_tint_color == 0 {
                                0xffffffff
                            } else {
                                self.screen_header_tint_color
                            }))
                            .text_size(px(30.0))
                            .cursor_pointer()
                            .child("‹")
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |_this, _event, window, cx| {
                                    if let Some(store) =
                                        cx.try_global::<crate::store::StoreGlobal>()
                                    {
                                        store.0.read(cx).host.dispatch_event(
                                            screen_tag,
                                            "headerBackButtonClicked",
                                            &serde_json::json!({}),
                                        );
                                        store.0.read(cx).frame_hook.arm(window);
                                    }
                                    cx.stop_propagation();
                                }),
                            ),
                    );
                }
            }
        }
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
                        // Reject the whole subtree before focus/edit side effects.
                        // A transparent overlay must let underlying siblings receive input.
                        let Some(target) = crate::events::target(cx, this) else {
                            return;
                        };
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
                        crate::events::send(
                            window,
                            cx,
                            &target,
                            event.position,
                            crate::events::Phase::Start,
                        );
                        cx.stop_propagation();
                    }),
                )
                .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, window, cx| {
                    let hit_target = crate::events::target(cx, this);
                    if event.pressed_button.is_some() {
                        if this.component == "TextInput" && this.input_selection_anchor.is_some() {
                            crate::input::select_at_point(this, event.position, true, window, cx);
                        }
                        // RN keeps the touch target fixed from mouse-down to
                        // release, including when the pointer leaves the view.
                        let target =
                            crate::events::active_touch_target(cx).or_else(|| hit_target.clone());
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
                        crate::events::hover(window, cx, hit_target.as_ref(), event.position);
                    }
                    if hit_target.is_some() || crate::events::active_touch_target(cx).is_some() {
                        cx.stop_propagation();
                    }
                }))
                .on_mouse_up(
                    MouseButton::Left,
                    cx.listener(|this, event: &MouseUpEvent, window, cx| {
                        let active_target = crate::events::active_touch_target(cx);
                        if let Some(target) = active_target.as_ref() {
                            crate::events::send(
                                window,
                                cx,
                                target,
                                event.position,
                                crate::events::Phase::End,
                            );
                        }
                        if active_target.is_some() || crate::events::target(cx, this).is_some() {
                            cx.stop_propagation();
                        }
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
                if let Some(color) = self.animated_text_color {
                    fragment.color = color;
                }
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
            let is_modal = self.component == "RNSScreen"
                && matches!(
                    self.screen_stack_presentation.as_str(),
                    "modal" | "transparentModal" | "containedModal" | "formSheet"
                );
            if is_modal {
                // A modal is composed over the existing stack: dim the whole
                // window for opaque presentations, then clip its RN content
                // into a centered desktop sheet. The outer RNSScreen remains
                // full-window for backdrop input and Escape dismissal.
                if self.screen_stack_presentation != "transparentModal" {
                    element = element.child(
                        div()
                            .absolute()
                            .inset_0()
                            .size_full()
                            .bg(style::color(0x80000000)),
                    );
                }
                let sheet_width = (frame.w - 48.0).min(760.0).max(0.0);
                let sheet_height = (frame.h - 48.0).min(640.0).max(0.0);
                let sheet_left = (frame.w - sheet_width) * 0.5;
                let sheet_top = (frame.h - sheet_height) * 0.5;
                element = element.child(
                    div()
                        .absolute()
                        .left(px(sheet_left * scale_x))
                        .top(px(sheet_top * scale_y))
                        .w(px(sheet_width * scale_x))
                        .h(px(sheet_height * scale_y))
                        .overflow_hidden()
                        .bg(style::color(
                            if self.screen_stack_presentation == "transparentModal" {
                                0x00000000
                            } else {
                                0xff171923
                            },
                        ))
                        .children(self.children.iter().map(|(_, child)| child.clone())),
                );
            } else {
                element = element.children(self.children.iter().map(|(_, child)| child.clone()));
            }
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
