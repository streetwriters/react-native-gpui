//! One GPUI view per Fabric node. No flex property is ever set: every frame
//! comes from RN's Yoga pass.

use crate::pointer_area::{pointer_area, PointerHandlers};
use crate::style;
use gpui::{
    div, point, prelude::*, px, AnyElement, App, Context, Display, Entity, Fill, FocusHandle,
    IntoElement, KeyDownEvent, KeyUpEvent, MouseButton, MouseDownEvent, MouseMoveEvent,
    MouseUpEvent, Pixels, Point, Position, Role, StyleRefinement, Subscription, Task, WeakEntity,
    Window,
};
use rn_gpui_sys::ffi::{MountOp, ParagraphFlat, RectF, ViewPropsFlat};
use std::cell::Cell;
use std::collections::HashMap;
use std::rc::Rc;
#[cfg(all(target_os = "macos", feature = "visual-capture"))]
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

static ACCESSIBILITY_ACTIVE: AtomicBool = AtomicBool::new(false);
static ACCESSIBILITY_ACTIVE_INITIALIZED: AtomicBool = AtomicBool::new(false);

#[no_mangle]
pub extern "C" fn rn_gpui_accessibility_active() -> bool {
    ACCESSIBILITY_ACTIVE.load(Ordering::Relaxed)
}

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
    pub tag: i32,
    render_count: u64,
    pub surface_id: i32,
    pub component: String,
    pub native_view_name: String,
    pub native_view_props: String,
    extension_props_json: String,
    #[cfg(target_os = "macos")]
    native_view_host: Option<std::rc::Rc<crate::native_view::NativeViewSurface>>,
    pub frame: RectF,
    pub view: ViewPropsFlat,
    animated_transform: Option<[f32; 16]>,
    animated_background_color: Option<u32>,
    animated_text_color: Option<u32>,
    pub paragraph: Option<ParagraphFlat>,
    pub input_text: String,
    pub input_placeholder: String,
    input_placeholder_mode: bool,
    input_text_color: u32,
    input_selection_color: u32,
    pub input_multiline: bool,
    pub input_editable: bool,
    input_secure_text: bool,
    pub input_selection: std::ops::Range<usize>,
    pub(crate) input_scroll_x: f32,
    pub(crate) input_selection_anchor: Option<usize>,
    pub input_marked: Option<std::ops::Range<usize>>,
    pub input_event_count: i32,
    caret_visible: bool,
    caret_blink_task: Task<()>,
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
    /// Outside the entity so a scroll can move it without updating this view:
    /// gpui-fast rebuilds every view that read an updated entity.
    scroll_position: Rc<Cell<Point<f32>>>,
    pub content_size: (f32, f32),
    pub scroll_horizontal: bool,
    pub scroll_enabled: bool,
    scroll_indicator_enabled: bool,
    scroll_indicator: Option<Entity<crate::scroll_indicator::ScrollIndicator>>,
    scroll_sync_generation: Rc<Cell<u64>>,
    scroll_handle: gpui::ScrollHandle,
    scroll_handle_stale: bool,
    pub focusable: bool,
    pending_text_input_focus: Option<bool>,
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    pub parent: Option<WeakEntity<RNNodeView>>,
    cached_style: StyleRefinement,
    pub(crate) inherited: Inherited,
    focus_handle: Option<FocusHandle>,
    focus_subscriptions: Vec<Subscription>,
}

static A11Y_TREE_DUMP_SCHEDULED: AtomicBool = AtomicBool::new(false);
static A11Y_TREE_DUMP_COMPLETE: AtomicBool = AtomicBool::new(false);
#[cfg(all(target_os = "macos", feature = "visual-capture"))]
static A11Y_TREE_DUMP_ATTEMPTS: AtomicUsize = AtomicUsize::new(0);

impl RNNodeView {
    pub(crate) fn accessibility_focus_handle(&self) -> Option<FocusHandle> {
        self.focus_handle.clone()
    }

    pub(crate) fn set_accessibility_tab_stop_allowed(&mut self, allowed: bool) {
        if let Some(handle) = self.focus_handle.take() {
            self.focus_handle = Some(handle.tab_stop(
                allowed
                    && (self.focusable || self.view.accessibility_has_escape_listener)
                    && !self.view.accessibility_disabled
                    && self.view.accessibility_responds_to_interaction
                    && !self.view.accessibility_hidden
                    && self.view.accessibility_important != 3
                    && !self.view.display_none,
            ));
        }
    }
    pub(crate) fn focus_for_accessibility(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(handle) = self.focus_handle.as_ref() {
            handle.focus(window, cx);
            log::info!(
                "[accessibility] focused tag {} from native request",
                self.tag
            );
        } else {
            log::warn!(
                "[accessibility] cannot focus tag {} because it has no focus handle",
                self.tag
            );
        }
    }

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

    #[cfg(any(test, debug_assertions))]
    fn hidden_by_modal_sibling_walked(&self, cx: &App) -> bool {
        let mut child_tag = self.tag;
        let mut parent = self.parent.clone();
        while let Some(parent_entity) = parent.and_then(|parent| parent.upgrade()) {
            let parent_view = parent_entity.read(cx);
            if parent_view.children.iter().any(|(sibling_tag, sibling)| {
                *sibling_tag != child_tag && sibling.read(cx).view.accessibility_modal
            }) {
                return true;
            }
            child_tag = parent_view.tag;
            parent = parent_view.parent.clone();
        }
        false
    }

    #[cfg(any(test, debug_assertions))]
    fn hidden_by_hidden_ancestor_walked(&self, cx: &App) -> bool {
        let mut parent = self.parent.clone();
        while let Some(entity) = parent.and_then(|parent| parent.upgrade()) {
            let node = entity.read(cx);
            if node.view.accessibility_hidden
                || node.view.accessibility_important == 3
                || node.view.display_none
            {
                return true;
            }
            parent = node.parent.clone();
        }
        false
    }

    fn accessibility_escape_target(&self, cx: &App) -> Option<i32> {
        if self.view.accessibility_has_escape_listener {
            return Some(self.tag);
        }
        let mut parent = self.parent.clone();
        while let Some(entity) = parent.and_then(|parent| parent.upgrade()) {
            let node = entity.read(cx);
            if node.view.accessibility_has_escape_listener {
                return Some(node.tag);
            }
            parent = node.parent.clone();
        }
        None
    }

    #[cfg(any(test, debug_assertions))]
    fn hidden_by_accessible_ancestor_walked(&self, cx: &App) -> bool {
        if self.focusable || self.view.accessible {
            return false;
        }
        let mut parent = self.parent.clone();
        while let Some(parent_entity) = parent.and_then(|parent| parent.upgrade()) {
            let parent_view = parent_entity.read(cx);
            if parent_view.view.accessible {
                return true;
            }
            parent = parent_view.parent.clone();
        }
        false
    }

    #[cfg(any(test, debug_assertions))]
    fn hidden_by_inactive_screen_ancestor_walked(&self, cx: &App) -> bool {
        let mut parent = self.parent.clone();
        while let Some(parent_entity) = parent.and_then(|parent| parent.upgrade()) {
            let parent_view = parent_entity.read(cx);
            if parent_view.component == "RNSScreen" && parent_view.screen_activity_state <= 0.0 {
                return true;
            }
            parent = parent_view.parent.clone();
        }
        false
    }

    fn accessible_group_text(&self, cx: &App) -> String {
        let Some(store) = cx.try_global::<crate::store::StoreGlobal>() else {
            return String::new();
        };
        fn collect(
            tag: i32,
            active_tag: i32,
            nodes: &HashMap<i32, Entity<RNNodeView>>,
            cx: &App,
            output: &mut String,
        ) {
            if tag == active_tag {
                return;
            }
            let Some(entity) = nodes.get(&tag) else {
                return;
            };
            let view = entity.read(cx);
            if view.component == "Paragraph" {
                if view.view.accessibility_hidden || view.view.accessibility_important == 3 {
                    return;
                }
                if let Some(paragraph) = &view.paragraph {
                    if !output.is_empty() {
                        output.push(' ');
                    }
                    for fragment in &paragraph.fragments {
                        output.push_str(&fragment.text);
                    }
                }
                return;
            }
            if view.view.accessible || view.focusable {
                return;
            }
            let children = view
                .children
                .iter()
                .map(|(tag, _)| *tag)
                .collect::<Vec<_>>();
            for child_tag in children {
                collect(child_tag, active_tag, nodes, cx, output);
            }
        }
        let store = store.0.read(cx);
        let mut text = String::new();
        let children = self
            .children
            .iter()
            .map(|(tag, _)| *tag)
            .collect::<Vec<_>>();
        for tag in children {
            collect(tag, self.tag, &store.nodes, cx, &mut text);
        }
        text
    }

    fn accessibility_labelled_by_text(&self, cx: &App) -> String {
        if self.view.accessibility_labelled_by.is_empty() {
            return String::new();
        }
        let Some(store) = cx.try_global::<crate::store::StoreGlobal>() else {
            return String::new();
        };
        let store = store.0.read(cx);
        fn collect(
            tag: i32,
            active_tag: i32,
            nodes: &HashMap<i32, Entity<RNNodeView>>,
            cx: &App,
            output: &mut String,
        ) {
            if tag == active_tag {
                return;
            }
            let Some(entity) = nodes.get(&tag) else {
                return;
            };
            let view = entity.read(cx);
            if !view.view.accessibility_label.is_empty() {
                output.push_str(&view.view.accessibility_label);
                return;
            }
            if view.component == "Paragraph" {
                if let Some(paragraph) = &view.paragraph {
                    for fragment in &paragraph.fragments {
                        output.push_str(&fragment.text);
                    }
                }
                return;
            }
            let children = view
                .children
                .iter()
                .map(|(tag, _)| *tag)
                .collect::<Vec<_>>();
            for child_tag in children {
                collect(child_tag, active_tag, nodes, cx, output);
            }
        }
        let mut labels = Vec::new();
        for native_id in &self.view.accessibility_labelled_by {
            let Some(tag) = store.nodes.iter().find_map(|(tag, entity)| {
                if *tag == self.tag {
                    return None;
                }
                let view = entity.read(cx);
                (view.view.accessibility_native_id == *native_id).then_some(*tag)
            }) else {
                continue;
            };
            let mut label = String::new();
            collect(tag, self.tag, &store.nodes, cx, &mut label);
            if !label.is_empty() {
                labels.push(label);
            }
        }
        labels.join(" ")
    }

    fn accessibility_role(&self) -> Option<Role> {
        // GPUI rejects `Role::GenericContainer` with a debug assertion, so
        // `importantForAccessibility="no"` exposes no role at all.
        if self.view.accessibility_important == 2 {
            return None;
        }
        if self.component == "Paragraph" && self.view.accessibility_role.is_empty() {
            return Some(Role::Label);
        }
        // `Image` is the platform's own component, so its default role is
        // accessibility policy rather than painting, and stays here.
        if self.component == "Image" && self.view.accessibility_role.is_empty() {
            return if self.view.accessible || !self.view.accessibility_label.is_empty() {
                Some(Role::Image)
            } else {
                None
            };
        }
        if self.component == "TextInput" && self.view.accessibility_role.is_empty() {
            return Some(if self.input_secure_text {
                Role::PasswordInput
            } else if self.input_multiline {
                Role::MultilineTextInput
            } else {
                Role::TextInput
            });
        }
        if self.view.accessibility_role.is_empty() {
            let traits = self.view.accessibility_traits;
            let trait_role = if traits & (1 << 0) != 0 {
                Some(Role::Button)
            } else if traits & (1 << 1) != 0 {
                Some(Role::Link)
            } else if traits & (1 << 2) != 0 {
                Some(Role::Image)
            } else if traits & (1 << 5) != 0 {
                Some(Role::Keyboard)
            } else if traits & (1 << 6) != 0 {
                Some(Role::Label)
            } else if traits & (1 << 7) != 0 {
                Some(Role::Note)
            } else if traits & (1 << 9) != 0 {
                Some(Role::Search)
            } else if traits & (1 << 12) != 0 {
                Some(Role::Slider)
            } else if traits & (1 << 15) != 0 {
                Some(Role::Heading)
            } else if traits & (1 << 16) != 0 {
                Some(Role::Switch)
            } else {
                None
            };
            if trait_role.is_some() {
                return trait_role;
            }
        }
        role_for_accessibility_role(&self.view.accessibility_role, self.view.accessible)
    }

    #[cfg(feature = "test-driver")]
    pub(crate) fn test_render_count(&self) -> u64 {
        self.render_count
    }

    pub(crate) fn nearest_focus_handle(&self, cx: &App) -> Option<FocusHandle> {
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
            extension_props_json: op.extension_props_json.clone(),
            #[cfg(target_os = "macos")]
            native_view_host: None,
            frame: if crate::extensions::component_portal(
                &op.component,
                &crate::extensions::parse_extension_props(&op.extension_props_json),
            )
            .is_some()
            {
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
            input_secure_text: op.text_input_secure,
            input_selection: 0..0,
            input_scroll_x: 0.0,
            input_selection_anchor: None,
            input_marked: None,
            input_event_count: 0,
            caret_visible: false,
            caret_blink_task: Task::ready(()),
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
            scroll_position: Rc::new(Cell::new(point(op.scroll_x, op.scroll_y))),
            content_size: (op.content_width, op.content_height),
            scroll_horizontal: op.scroll_horizontal,
            scroll_enabled: op.scroll_enabled,
            scroll_indicator_enabled: op.scroll_indicator,
            scroll_indicator: None,
            scroll_sync_generation: Rc::new(Cell::new(0)),
            scroll_handle: gpui::ScrollHandle::new(),
            scroll_handle_stale: true,
            focusable: op.view.focusable || op.component == "TextInput",
            pending_text_input_focus: None,
            children: Vec::new(),
            parent: None,
            cached_style: StyleRefinement::default(),
            inherited: Inherited::default(),
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
            #[cfg(target_os = "macos")]
            {
                self.native_view_host = None;
            }
        }
        self.frame = if crate::extensions::component_portal(
            &op.component,
            &crate::extensions::parse_extension_props(&op.extension_props_json),
        )
        .is_some()
        {
            rn_gpui_sys::ffi::RectF {
                x: 0.0,
                y: 0.0,
                ..op.frame
            }
        } else {
            op.frame
        };
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
            // Fabric's offset is an echo of what this view reported earlier; taking it
            // back would snap a scroll in progress to an older position.
            self.content_size = (op.content_width, op.content_height);
            let offset = self.scroll_offset();
            self.scroll_handle_stale = true;
            self.scroll_position.set(point(
                offset
                    .x
                    .clamp(0.0, (op.content_width - op.frame.w).max(0.0)),
                offset
                    .y
                    .clamp(0.0, (op.content_height - op.frame.h).max(0.0)),
            ));
            self.scroll_horizontal = op.scroll_horizontal;
            self.scroll_enabled = op.scroll_enabled;
            self.scroll_indicator_enabled = op.scroll_indicator;
        }
        if op.props_changed {
            self.extension_props_json = op.extension_props_json.clone();
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
            log::trace!(
                "[transform] tag={} has rotation/skew/perspective; GPUI subtree transform spike is not supported",
                self.tag
            );
        }
        (scale_x, scale_y, translate_x, translate_y)
    }

    fn origin_frame(&self, cx: &App) -> (f32, f32) {
        let top_inset = cx
            .try_global::<crate::store::StoreGlobal>()
            .map(|store| store.0.read(cx).top_inset)
            .unwrap_or(0.0);
        self.origin_frame_with_top_inset(top_inset)
    }

    /// `refresh_inherited` runs while `ViewStore` is being updated, so the inset
    /// is passed in instead of read back from the global.
    pub(crate) fn origin_frame_with_top_inset(&self, top_inset: f32) -> (f32, f32) {
        let mut own_frame = (self.frame.x, self.frame.y);
        if self.component == "RNSScreenStackHeaderConfig" {
            own_frame.1 += top_inset;
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

    pub(crate) fn inherit_input(&self, top_inset: f32) -> InheritInput {
        InheritInput {
            origin_frame: self.origin_frame_with_top_inset(top_inset),
            transform: self.local_transform(),
            border: (self.view.border_widths.left, self.view.border_widths.top),
            scroll: (self.component == "ScrollView").then(|| self.scroll_position.clone()),
            accessible: self.view.accessible,
            hides_descendants: self.view.accessibility_hidden
                || self.view.accessibility_important == 3
                || self.view.display_none,
            inactive_screen: self.component == "RNSScreen" && self.screen_activity_state <= 0.0,
            other_modal_child: false,
            focusable_or_accessible: self.focusable || self.view.accessible,
        }
    }

    pub(crate) fn screen_transition_active(&self, cx: &App) -> bool {
        if cx.reduce_motion() || crate::animation_policy::animations_disabled() {
            return false;
        }
        self.screen_transition.is_some_and(|transition| {
            Instant::now().saturating_duration_since(transition.started_at) < transition.duration
        })
    }

    pub fn absolute_origin(&self, _cx: &App) -> Point<Pixels> {
        let (mut x, mut y) = self.inherited.origin_unscrolled;
        for link in self.inherited.scrollers.iter() {
            let offset = link.position.get();
            x -= link.scale.0 * offset.x;
            y -= link.scale.1 * offset.y;
        }
        point(px(x), px(y))
    }

    #[cfg(any(test, debug_assertions))]
    pub fn absolute_origin_walked(&self, cx: &App) -> Point<Pixels> {
        let mut chain = vec![OriginStep {
            frame: self.origin_frame(cx),
            transform: self.local_transform(),
            scroll: (self.scroll_offset().x, self.scroll_offset().y),
            is_scroll: self.component == "ScrollView",
        }];
        let mut parent = self.parent.clone();
        while let Some(weak) = parent {
            let Some(node) = weak.upgrade() else { break };
            let node = node.read(cx);
            chain.push(OriginStep {
                frame: node.origin_frame(cx),
                transform: node.local_transform(),
                scroll: (node.scroll_offset().x, node.scroll_offset().y),
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
                    !(cx.reduce_motion() || crate::animation_policy::animations_disabled())
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

    pub(crate) fn cumulative_scale(&self, _cx: &App) -> (f32, f32) {
        (self.inherited.scale.0.abs(), self.inherited.scale.1.abs())
    }

    #[cfg(any(test, debug_assertions))]
    pub(crate) fn cumulative_scale_walked(&self, cx: &App) -> (f32, f32) {
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

    /// `RN_GPUI_VERIFY_INHERITED=1`: checks the cached `Inherited` against the
    /// walking versions.
    #[cfg(debug_assertions)]
    fn verify_inherited(&self, cx: &App) {
        let walked = self.absolute_origin_walked(cx);
        let cached = self.absolute_origin(cx);
        for (field, walked, cached) in [
            ("origin.x", f32::from(walked.x), f32::from(cached.x)),
            ("origin.y", f32::from(walked.y), f32::from(cached.y)),
        ] {
            if (walked - cached).abs() > 0.01 {
                log::error!(
                    "[inherited] mismatch tag={} field={field} cached={cached} walked={walked}",
                    self.tag
                );
            }
        }
        let (walked_scale_x, walked_scale_y) = self.cumulative_scale_walked(cx);
        let (cached_scale_x, cached_scale_y) = self.cumulative_scale(cx);
        for (field, walked, cached) in [
            ("scale.x", walked_scale_x, cached_scale_x),
            ("scale.y", walked_scale_y, cached_scale_y),
            (
                "hidden_by_accessible_ancestor",
                f32::from(self.hidden_by_accessible_ancestor_walked(cx)),
                f32::from(self.inherited.hidden_by_accessible_ancestor),
            ),
            (
                "hidden_by_hidden_ancestor",
                f32::from(self.hidden_by_hidden_ancestor_walked(cx)),
                f32::from(self.inherited.hidden_by_hidden_ancestor),
            ),
            (
                "hidden_by_modal_sibling",
                f32::from(self.hidden_by_modal_sibling_walked(cx)),
                f32::from(self.inherited.hidden_by_modal_sibling),
            ),
            (
                "hidden_by_inactive_screen_ancestor",
                f32::from(self.hidden_by_inactive_screen_ancestor_walked(cx)),
                f32::from(self.inherited.hidden_by_inactive_screen_ancestor),
            ),
        ] {
            if (walked - cached).abs() > 0.01 {
                log::error!(
                    "[inherited] mismatch tag={} field={field} cached={cached} walked={walked}",
                    self.tag
                );
            }
        }
    }
}

#[cfg(debug_assertions)]
fn verify_inherited_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var_os("RN_GPUI_VERIFY_INHERITED").is_some())
}

fn role_for_accessibility_role(role: &str, accessible: bool) -> Option<Role> {
    Some(match role {
        "none" | "presentation" => return None,
        "button" | "imagebutton" | "togglebutton" => Role::Button,
        "image" | "img" => Role::Image,
        "link" => Role::Link,
        "header" | "heading" => Role::Heading,
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
        "alertdialog" => Role::AlertDialog,
        "application" => Role::Application,
        "article" => Role::Article,
        "banner" => Role::Banner,
        "complementary" => Role::Complementary,
        "contentinfo" => Role::ContentInfo,
        "definition" => Role::Definition,
        "directory" => Role::List,
        "feed" => Role::Feed,
        "figure" => Role::Figure,
        "form" => Role::Form,
        "log" => Role::Log,
        "main" => Role::Main,
        "marquee" => Role::Marquee,
        "math" => Role::Math,
        "meter" => Role::Meter,
        "navigation" => Role::Navigation,
        "option" => Role::ListBoxOption,
        "region" => Role::Region,
        "rowgroup" => Role::RowGroup,
        "rowheader" => Role::RowHeader,
        "columnheader" => Role::ColumnHeader,
        "searchbox" => Role::SearchInput,
        "separator" => Role::Splitter,
        "status" => Role::Status,
        "tabpanel" => Role::TabPanel,
        "term" => Role::Term,
        "tooltip" => Role::Tooltip,
        "tree" => Role::Tree,
        "treegrid" => Role::TreeGrid,
        "treeitem" => Role::TreeItem,
        "textbox" => Role::TextInput,
        "generic" | "group" => Role::Group,
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

fn accessibility_action_for_name(name: &str) -> Option<gpui::AccessibleAction> {
    Some(match name {
        "activate" => gpui::AccessibleAction::Click,
        "increment" => gpui::AccessibleAction::Increment,
        "decrement" => gpui::AccessibleAction::Decrement,
        "longpress" => gpui::AccessibleAction::ShowContextMenu,
        "expand" => gpui::AccessibleAction::Expand,
        "collapse" => gpui::AccessibleAction::Collapse,
        _ => return None,
    })
}

fn dispatch_accessibility_event(
    tag: i32,
    event: &str,
    payload: &serde_json::Value,
    window: &mut Window,
    cx: &mut App,
) {
    let Some(store) = cx.try_global::<crate::store::StoreGlobal>() else {
        return;
    };
    let (host, frame_hook) = {
        let store = store.0.read(cx);
        (store.host.clone(), store.frame_hook.clone())
    };
    host.dispatch_event(tag, event, payload);
    frame_hook.arm(window);
}

fn focus_adjacent_semantic_sibling(
    view: &RNNodeView,
    key: &str,
    window: &mut Window,
    cx: &mut App,
) -> bool {
    let Some(role @ (Role::RadioButton | Role::Tab)) = view.accessibility_role() else {
        return false;
    };
    let direction = match key {
        "left" | "up" => -1,
        "right" | "down" => 1,
        _ => return false,
    };
    let Some(parent) = view.parent.as_ref().and_then(WeakEntity::upgrade) else {
        return false;
    };
    let parent = parent.read(cx);
    let mut siblings = Vec::new();
    for (tag, entity) in &parent.children {
        if *tag == view.tag {
            if let Some(focus) = view.focus_handle.clone() {
                siblings.push((*tag, focus));
            }
            continue;
        }
        let sibling = entity.read(cx);
        if sibling.accessibility_role() == Some(role)
            && sibling.focusable
            && sibling.view.accessibility_responds_to_interaction
            && !sibling.view.accessibility_disabled
            && !sibling.view.accessibility_hidden
            && !sibling.view.display_none
        {
            if let Some(focus) = sibling.focus_handle.clone() {
                siblings.push((*tag, focus));
            }
        }
    }
    let Some(current_index) = siblings.iter().position(|(tag, _)| *tag == view.tag) else {
        return false;
    };
    if siblings.len() < 2 {
        return false;
    }
    let next_index = if direction > 0 {
        (current_index + 1) % siblings.len()
    } else {
        (current_index + siblings.len() - 1) % siblings.len()
    };
    let (tag, focus_handle) = &siblings[next_index];
    let tag = *tag;
    let focus_handle = focus_handle.clone();
    window.on_next_frame(move |window, cx| {
        focus_handle.focus(window, cx);
        dispatch_accessibility_event(tag, "click", &serde_json::json!({}), window, cx);
    });
    true
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

#[derive(Clone)]
pub(crate) struct ScrollLink {
    pub(crate) position: Rc<Cell<Point<f32>>>,
    pub(crate) scale: (f32, f32),
}

#[derive(Clone)]
pub(crate) struct Inherited {
    pub(crate) parent_scale: (f32, f32),
    pub(crate) scale: (f32, f32),
    pub(crate) origin_unscrolled: (f32, f32),
    pub(crate) parent_border: (f32, f32),
    pub(crate) scrollers: Rc<[ScrollLink]>,
    pub(crate) accessible_ancestor: bool,
    pub(crate) hidden_by_accessible_ancestor: bool,
    pub(crate) hidden_by_hidden_ancestor: bool,
    pub(crate) hidden_by_modal_sibling: bool,
    pub(crate) hidden_by_inactive_screen_ancestor: bool,
}

impl Default for Inherited {
    fn default() -> Self {
        Self {
            parent_scale: (1.0, 1.0),
            scale: (1.0, 1.0),
            origin_unscrolled: (0.0, 0.0),
            parent_border: (0.0, 0.0),
            scrollers: Rc::from(Vec::new()),
            accessible_ancestor: false,
            hidden_by_accessible_ancestor: false,
            hidden_by_hidden_ancestor: false,
            hidden_by_modal_sibling: false,
            hidden_by_inactive_screen_ancestor: false,
        }
    }
}

impl Inherited {
    pub(crate) fn same(&self, other: &Inherited) -> bool {
        self.same_render_affecting(other)
            && self.origin_unscrolled == other.origin_unscrolled
            && self.scrollers.len() == other.scrollers.len()
            && self
                .scrollers
                .iter()
                .zip(other.scrollers.iter())
                .all(|(left, right)| {
                    Rc::ptr_eq(&left.position, &right.position) && left.scale == right.scale
                })
    }

    pub(crate) fn same_render_affecting(&self, other: &Inherited) -> bool {
        self.parent_scale == other.parent_scale
            && self.scale == other.scale
            && self.parent_border == other.parent_border
            && self.accessible_ancestor == other.accessible_ancestor
            && self.hidden_by_accessible_ancestor == other.hidden_by_accessible_ancestor
            && self.hidden_by_hidden_ancestor == other.hidden_by_hidden_ancestor
            && self.hidden_by_modal_sibling == other.hidden_by_modal_sibling
            && self.hidden_by_inactive_screen_ancestor == other.hidden_by_inactive_screen_ancestor
    }
}

#[derive(Clone)]
pub(crate) struct InheritInput {
    pub(crate) origin_frame: (f32, f32),
    pub(crate) transform: (f32, f32, f32, f32),
    pub(crate) border: (f32, f32),
    pub(crate) scroll: Option<Rc<Cell<Point<f32>>>>,
    pub(crate) accessible: bool,
    pub(crate) hides_descendants: bool,
    pub(crate) inactive_screen: bool,
    pub(crate) other_modal_child: bool,
    pub(crate) focusable_or_accessible: bool,
}

pub(crate) fn inherit(
    parent: Option<(&Inherited, &InheritInput)>,
    own: &InheritInput,
) -> Inherited {
    let mut inherited = Inherited {
        parent_scale: parent.map_or((1.0, 1.0), |(parent, _)| parent.scale),
        ..Inherited::default()
    };
    match parent {
        Some((parent, input)) => {
            // This is `accumulate_origin` with the parent's scroll forced to
            // zero, so the offset stays a live value the input path subtracts.
            inherited.origin_unscrolled = (
                parent.origin_unscrolled.0
                    + inherited.parent_scale.0 * (own.origin_frame.0 + own.transform.2),
                parent.origin_unscrolled.1
                    + inherited.parent_scale.1 * (own.origin_frame.1 + own.transform.3),
            );
            inherited.parent_border = input.border;
            inherited.scrollers = match &input.scroll {
                Some(position) => {
                    let mut links = parent.scrollers.to_vec();
                    links.push(ScrollLink {
                        position: position.clone(),
                        scale: inherited.parent_scale,
                    });
                    Rc::from(links)
                }
                None => parent.scrollers.clone(),
            };
            inherited.accessible_ancestor = parent.accessible_ancestor || input.accessible;
            inherited.hidden_by_hidden_ancestor =
                parent.hidden_by_hidden_ancestor || input.hides_descendants;
            inherited.hidden_by_modal_sibling =
                parent.hidden_by_modal_sibling || input.other_modal_child;
            inherited.hidden_by_inactive_screen_ancestor =
                parent.hidden_by_inactive_screen_ancestor || input.inactive_screen;
        }
        None => {
            inherited.origin_unscrolled = (
                own.origin_frame.0 + own.transform.2,
                own.origin_frame.1 + own.transform.3,
            );
        }
    }
    inherited.scale = (
        inherited.parent_scale.0 * own.transform.0,
        inherited.parent_scale.1 * own.transform.1,
    );
    inherited.hidden_by_accessible_ancestor =
        !own.focusable_or_accessible && inherited.accessible_ancestor;
    inherited
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

#[cfg(test)]
mod inherited_tests {
    use super::{accumulate_origin, inherit, InheritInput, Inherited, OriginStep};
    use gpui::point;
    use std::cell::Cell;
    use std::rc::Rc;

    fn node(
        origin_frame: (f32, f32),
        transform: (f32, f32, f32, f32),
        border: (f32, f32),
    ) -> InheritInput {
        InheritInput {
            origin_frame,
            transform,
            border,
            scroll: None,
            accessible: false,
            hides_descendants: false,
            inactive_screen: false,
            other_modal_child: false,
            focusable_or_accessible: false,
        }
    }

    fn plain() -> InheritInput {
        node((0.0, 0.0), (1.0, 1.0, 0.0, 0.0), (0.0, 0.0))
    }

    fn scrolling(
        origin_frame: (f32, f32),
        transform: (f32, f32, f32, f32),
        offset: (f32, f32),
    ) -> InheritInput {
        InheritInput {
            scroll: Some(Rc::new(Cell::new(point(offset.0, offset.1)))),
            ..node(origin_frame, transform, (0.0, 0.0))
        }
    }

    fn inherited(chain: &[InheritInput]) -> Inherited {
        let mut parent: Option<(Inherited, InheritInput)> = None;
        let mut last = Inherited::default();
        for own in chain {
            last = inherit(
                parent.as_ref().map(|(inherited, input)| (inherited, input)),
                own,
            );
            parent = Some((last.clone(), own.clone()));
        }
        last
    }

    fn cached_origin(chain: &[InheritInput]) -> (f32, f32) {
        let inherited = inherited(chain);
        let (mut x, mut y) = inherited.origin_unscrolled;
        for link in inherited.scrollers.iter() {
            let offset = link.position.get();
            x -= link.scale.0 * offset.x;
            y -= link.scale.1 * offset.y;
        }
        (x, y)
    }

    fn walked_origin(chain: &[InheritInput]) -> (f32, f32) {
        let steps: Vec<OriginStep> = chain
            .iter()
            .map(|input| OriginStep {
                frame: input.origin_frame,
                transform: input.transform,
                scroll: input
                    .scroll
                    .as_ref()
                    .map(|position| (position.get().x, position.get().y))
                    .unwrap_or_default(),
                is_scroll: input.scroll.is_some(),
            })
            .collect();
        accumulate_origin(&steps)
    }

    fn assert_same_origin(chain: &[InheritInput]) {
        let cached = cached_origin(chain);
        let walked = walked_origin(chain);
        assert!(
            (cached.0 - walked.0).abs() < 0.01 && (cached.1 - walked.1).abs() < 0.01,
            "cached {cached:?} != walked {walked:?}"
        );
    }

    #[test]
    fn plain_nesting_accumulates_origins() {
        let chain = [
            node((10.0, 20.0), (1.0, 1.0, 0.0, 0.0), (0.0, 0.0)),
            node((5.0, 7.0), (1.0, 1.0, 0.0, 0.0), (0.0, 0.0)),
        ];
        assert_same_origin(&chain);
        assert_eq!(inherited(&chain).origin_unscrolled, (15.0, 27.0));
        assert_eq!(inherited(&chain).scale, (1.0, 1.0));
    }

    #[test]
    fn a_scaled_parent_scales_its_children() {
        let chain = [
            node((100.0, 0.0), (2.0, 2.0, 0.0, 0.0), (0.0, 0.0)),
            node((10.0, 20.0), (1.0, 1.0, 3.0, 4.0), (0.0, 0.0)),
        ];
        assert_same_origin(&chain);
        assert_eq!(inherited(&chain).origin_unscrolled, (126.0, 48.0));
        assert_eq!(inherited(&chain).scale, (2.0, 2.0));
    }

    #[test]
    fn a_scrollview_offset_moves_only_its_descendants() {
        let chain = [
            scrolling((0.0, 0.0), (1.0, 1.0, 0.0, 0.0), (0.0, 100.0)),
            node((10.0, 20.0), (1.0, 1.0, 0.0, 0.0), (0.0, 0.0)),
        ];
        assert_same_origin(&chain);
        assert_eq!(cached_origin(&chain), (10.0, -80.0));
        assert_eq!(inherited(&chain[..1]).origin_unscrolled, (0.0, 0.0));
    }

    #[test]
    fn a_scrollview_inside_a_scaled_parent_scrolls_at_that_scale() {
        let chain = [
            node((0.0, 0.0), (2.0, 2.0, 0.0, 0.0), (0.0, 0.0)),
            scrolling((0.0, 0.0), (1.0, 1.0, 0.0, 0.0), (0.0, 50.0)),
            node((0.0, 10.0), (1.0, 1.0, 0.0, 0.0), (0.0, 0.0)),
        ];
        assert_same_origin(&chain);
        let inherited = inherited(&chain);
        assert_eq!(inherited.scrollers.len(), 1);
        assert_eq!(inherited.scrollers[0].scale, (2.0, 2.0));
        assert_eq!(cached_origin(&chain), (0.0, -80.0));
    }

    #[test]
    fn nested_scrollviews_keep_both_offsets_outermost_first() {
        let chain = [
            scrolling((0.0, 0.0), (1.0, 1.0, 0.0, 0.0), (0.0, 10.0)),
            node((0.0, 0.0), (2.0, 2.0, 0.0, 0.0), (0.0, 0.0)),
            scrolling((0.0, 0.0), (1.0, 1.0, 0.0, 0.0), (0.0, 20.0)),
            node((0.0, 5.0), (1.0, 1.0, 0.0, 0.0), (0.0, 0.0)),
        ];
        assert_same_origin(&chain);
        let inherited = inherited(&chain);
        assert_eq!(inherited.scrollers.len(), 2);
        assert_eq!(inherited.scrollers[0].scale, (1.0, 1.0));
        assert_eq!(inherited.scrollers[1].scale, (2.0, 2.0));
        assert_eq!(cached_origin(&chain), (0.0, -40.0));
    }

    #[test]
    fn a_scroll_offset_never_changes_the_cached_value() {
        let position = Rc::new(Cell::new(point(0.0, 0.0)));
        let mut root = plain();
        root.scroll = Some(position.clone());
        let child = plain();
        let before = inherited(&[root.clone(), child.clone()]);
        assert_eq!(cached_origin(&[root.clone(), child.clone()]), (0.0, 0.0));
        position.set(point(0.0, 40.0));
        let after = inherited(&[root.clone(), child.clone()]);
        assert!(before.same(&after));
        assert_eq!(cached_origin(&[root, child]), (0.0, -40.0));
    }

    #[test]
    fn a_parent_border_is_remembered_unscaled() {
        let root = node((0.0, 0.0), (2.0, 2.0, 0.0, 0.0), (3.0, 4.0));
        assert_eq!(inherited(&[root, plain()]).parent_border, (3.0, 4.0));
        assert_eq!(inherited(&[plain()]).parent_border, (0.0, 0.0));
    }

    #[test]
    fn hidden_by_hidden_ancestor_follows_the_running_flag() {
        let mut root = plain();
        root.hides_descendants = true;
        let chain = [root.clone(), plain(), plain()];
        assert!(inherited(&chain).hidden_by_hidden_ancestor);
        assert!(!inherited(&[root]).hidden_by_hidden_ancestor);
        assert!(!inherited(&[plain(), plain()]).hidden_by_hidden_ancestor);
    }

    #[test]
    fn hidden_by_inactive_screen_ancestor_follows_the_running_flag() {
        let mut root = plain();
        root.inactive_screen = true;
        assert!(inherited(&[root.clone(), plain()]).hidden_by_inactive_screen_ancestor);
        assert!(!inherited(&[root]).hidden_by_inactive_screen_ancestor);
        assert!(!inherited(&[plain(), plain()]).hidden_by_inactive_screen_ancestor);
    }

    #[test]
    fn hidden_by_modal_sibling_is_set_by_the_parent_for_each_child() {
        let mut root = plain();
        root.other_modal_child = true;
        assert!(inherited(&[root.clone(), plain()]).hidden_by_modal_sibling);
        assert!(!inherited(&[root]).hidden_by_modal_sibling);
        assert!(!inherited(&[plain(), plain()]).hidden_by_modal_sibling);
    }

    #[test]
    fn hidden_by_accessible_ancestor_spares_focusable_and_accessible_nodes() {
        let mut root = plain();
        root.accessible = true;
        let child = plain();
        assert!(inherited(&[root.clone(), child.clone()]).hidden_by_accessible_ancestor);

        let mut focusable = plain();
        focusable.focusable_or_accessible = true;
        assert!(!inherited(&[root.clone(), focusable]).hidden_by_accessible_ancestor);

        let mut accessible = plain();
        accessible.accessible = true;
        accessible.focusable_or_accessible = true;
        assert!(!inherited(&[root, accessible]).hidden_by_accessible_ancestor);

        assert!(!inherited(&[child.clone(), child]).hidden_by_accessible_ancestor);
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

pub(crate) static RENDER_COUNT: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

impl Render for RNNodeView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        RENDER_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        self.render_count += 1;
        let accessibility_active = window.is_a11y_active();
        let was_initialized = ACCESSIBILITY_ACTIVE_INITIALIZED.swap(true, Ordering::Relaxed);
        let previous_accessibility_active =
            ACCESSIBILITY_ACTIVE.swap(accessibility_active, Ordering::Relaxed);
        if cfg!(not(target_os = "macos"))
            && was_initialized
            && previous_accessibility_active != accessibility_active
        {
            if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                store
                    .0
                    .read(cx)
                    .host
                    .emit_device_event_bool("screenReaderChanged", accessibility_active);
            }
        }
        if std::env::var_os("RN_GPUI_DEBUG_A11Y_TREE").is_some()
            && !A11Y_TREE_DUMP_COMPLETE.load(Ordering::Relaxed)
            && A11Y_TREE_DUMP_SCHEDULED
                .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
        {
            window.on_next_frame(|window, _cx| {
                #[cfg(all(target_os = "macos", feature = "visual-capture"))]
                let attempts = A11Y_TREE_DUMP_ATTEMPTS.fetch_add(1, Ordering::Relaxed);
                if let Some(tree) = window.debug_a11y_tree_json() {
                    log::info!("[a11y-tree] {tree}");
                    A11Y_TREE_DUMP_COMPLETE.store(true, Ordering::Relaxed);
                } else {
                    #[cfg(all(target_os = "macos", feature = "visual-capture"))]
                    {
                        if attempts >= 10 {
                            log::error!("[a11y-tree] provider did not activate after 10 frames");
                            A11Y_TREE_DUMP_COMPLETE.store(true, Ordering::Relaxed);
                            return;
                        }
                        crate::native_view::activate_accessibility_probe(window);
                        A11Y_TREE_DUMP_SCHEDULED.store(false, Ordering::Relaxed);
                        window.refresh();
                    }
                    #[cfg(not(all(target_os = "macos", feature = "visual-capture")))]
                    {
                        log::info!("[a11y-tree] unavailable (no active AccessKit client)");
                        A11Y_TREE_DUMP_COMPLETE.store(true, Ordering::Relaxed);
                    }
                }
            });
        }
        if debug_render_counts_enabled() {
            log::info!(
                "[retention] RNNodeView::render elapsed_ms={} tag={} component={} count={}",
                elapsed_since_first_render_ms(),
                self.tag,
                self.component,
                self.render_count
            );
        }
        let hidden_portal = crate::extensions::component_portal(
            &self.component,
            &crate::extensions::parse_extension_props(&self.extension_props_json),
        )
        .is_some_and(|portal| !portal.visible);
        if self.view.display_none || hidden_portal {
            return div().id(self.tag).size_0().into_any_element();
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
        // Yoga's child frames already include the parent's border inset, and GPUI
        // positions absolute children inside that border as well.
        let (parent_scale_x, parent_scale_y) = self.inherited.parent_scale;
        let (origin_x, origin_y) = self.origin_frame(cx);
        let (_, _, translate_x, translate_y) = self.local_transform();
        // No parent scroll offset here: the ScrollView moves all its children at once
        // through its content wrapper.
        let base_left = parent_scale_x * (origin_x + translate_x)
            - self.inherited.parent_border.0 * parent_scale_x.abs();
        let base_top = parent_scale_y * (origin_y + translate_y)
            - self.inherited.parent_border.1 * parent_scale_y.abs();
        #[cfg(debug_assertions)]
        if verify_inherited_enabled() {
            self.verify_inherited(cx);
        }
        let transition = if cx.reduce_motion() || crate::animation_policy::animations_disabled() {
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
        let ordered_children = self.children.clone();
        if let Some(renderer) = crate::extensions::component_renderer(&self.component) {
            let node = self.component_node(cx);
            if let Some(painted) = renderer.render(&node, window, cx) {
                return painted;
            }
        }
        let mut element = div().id(self.tag);
        if self.component == "RNSScreenStack" {
            element = element.overflow_hidden();
        }
        if self.view.desktop_drag_region {
            element = element.window_control_area(gpui::WindowControlArea::Drag);
        } else {
            match self.view.desktop_window_control.as_str() {
                "minimize" => element = element.window_control_area(gpui::WindowControlArea::Min),
                "maximize" => element = element.window_control_area(gpui::WindowControlArea::Max),
                "close" => element = element.window_control_area(gpui::WindowControlArea::Close),
                _ => {}
            }
        }
        let accessibility_id = if self.view.accessibility_native_id.is_empty() {
            &self.view.test_id
        } else {
            &self.view.accessibility_native_id
        };
        if !accessibility_id.is_empty() {
            element = element.accessibility_id(accessibility_id.clone());
        }
        if !self.view.accessibility_label.is_empty() {
            element = element.aria_label(self.view.accessibility_label.clone());
        }
        if !self.view.accessibility_hint.is_empty() {
            element = element.aria_description(self.view.accessibility_hint.clone());
        }
        if self.view.accessibility_label.is_empty() {
            let labelled_by = if accessibility_active {
                self.accessibility_labelled_by_text(cx)
            } else {
                String::new()
            };
            let label = if !labelled_by.is_empty() {
                labelled_by
            } else if self.view.accessible && accessibility_active {
                self.accessible_group_text(cx)
            } else {
                String::new()
            };
            if !label.is_empty() {
                element = element.aria_label(label);
            }
        }
        if self.component == "Paragraph" && self.view.accessibility_label.is_empty() {
            if let Some(paragraph) = &self.paragraph {
                let text = paragraph
                    .fragments
                    .iter()
                    .map(|fragment| fragment.text.as_str())
                    .collect::<String>();
                if !text.is_empty() {
                    element = element.aria_value(text);
                }
            }
        }
        if !self.view.accessibility_value_text.is_empty() {
            element = element.aria_value(self.view.accessibility_value_text.clone());
        }
        if self.view.accessibility_has_value_min {
            element = element.aria_min_numeric_value(self.view.accessibility_value_min as f64);
        }
        if self.view.accessibility_has_value_max {
            element = element.aria_max_numeric_value(self.view.accessibility_value_max as f64);
        }
        if self.view.accessibility_has_value_now {
            element = element.aria_numeric_value(self.view.accessibility_value_now as f64);
        }
        if self.component == "TextInput" {
            if !self.input_placeholder.is_empty() {
                element = element.aria_placeholder(self.input_placeholder.clone());
            }
            if !self.input_secure_text && !self.input_text.is_empty() {
                element = element.aria_value(self.input_text.clone());
            }
        }
        if let Some(role) = self.accessibility_role() {
            element = element.role(role);
        }
        if accessibility_active && self.accessibility_role() == Some(Role::ListItem) {
            if let Some(parent) = self.parent.as_ref().and_then(|parent| parent.upgrade()) {
                let parent = parent.read(cx);
                let mut position = None;
                let mut size = 0;
                for (tag, sibling) in &parent.children {
                    // Render already leases self. Never read it through Entity.
                    let is_item = *tag == self.tag
                        || sibling.read(cx).accessibility_role() == Some(Role::ListItem);
                    if is_item {
                        size += 1;
                        if *tag == self.tag {
                            position = Some(size);
                        }
                    }
                }
                if let Some(position) = position {
                    element = element
                        .aria_position_in_set(position)
                        .aria_size_of_set(size);
                }
            }
        }
        // An `Image` with no label, role or `accessible` is decorative, so it
        // stays out of the accessibility tree. That is policy for a core
        // component, not painting, so it stays here.
        let hidden_image = self.component == "Image"
            && self.view.accessibility_label.is_empty()
            && self.view.accessibility_role.is_empty()
            && !self.view.accessible;
        let hidden_by_accessible_ancestor = self.inherited.hidden_by_accessible_ancestor;
        let hidden_by_hidden_ancestor = self.inherited.hidden_by_hidden_ancestor;
        let hidden_by_modal_sibling = self.inherited.hidden_by_modal_sibling;
        let hidden_by_active_modal = crate::accessibility::hidden_by_active_modal(self.tag, cx);
        let hidden_by_inactive_screen_ancestor = self.inherited.hidden_by_inactive_screen_ancestor;
        let hidden_inactive_screen = self.component == "RNSScreen"
            && self.screen_activity_state <= 0.0
            && transition_progress.is_none_or(|progress| progress >= 1.0);
        let hidden_display_none = self.view.display_none;
        let accessibility = self.view.clone();
        #[cfg(feature = "visual-capture")]
        let accessibility_tag = self.tag;
        let input_editable = self.input_editable;
        let input_secure_text = self.input_secure_text;
        let is_text_input = self.component == "TextInput";
        let input_text = self.input_text.clone();
        let input_placeholder = self.input_placeholder.clone();
        element = element.a11y_synthetic_children(move |builder| {
            let node = builder.parent_node();
            if accessibility.accessibility_important == 3
                || accessibility.accessibility_hidden
                || hidden_image
                || hidden_image
                || hidden_by_accessible_ancestor
                || hidden_by_hidden_ancestor
                || hidden_by_modal_sibling
                || hidden_by_active_modal
                || hidden_by_inactive_screen_ancestor
                || hidden_inactive_screen
                || hidden_display_none
            {
                node.set_hidden();
            }
            if accessibility.accessibility_modal {
                node.set_modal();
            }
            if accessibility.accessibility_busy {
                node.set_busy();
            }
            if accessibility.accessibility_disabled
                || !accessibility.accessibility_responds_to_interaction
            {
                node.set_disabled();
            }
            if accessibility.accessibility_selected {
                node.set_selected(true);
            }
            if accessibility.accessibility_expanded >= 0 {
                node.set_expanded(accessibility.accessibility_expanded != 0);
            }
            match accessibility.accessibility_checked {
                1 => node.set_toggled(gpui::Toggled::False),
                2 => node.set_toggled(gpui::Toggled::True),
                3 => node.set_toggled(gpui::Toggled::Mixed),
                _ => {}
            }
            if !accessibility.accessibility_language.is_empty() {
                node.set_language(accessibility.accessibility_language.clone());
            }
            match accessibility.accessibility_live_region {
                1 => node.set_live(gpui::accesskit::Live::Polite),
                2 => node.set_live(gpui::accesskit::Live::Assertive),
                _ => {}
            }
            if accessibility.accessibility_has_value_min {
                node.set_min_numeric_value(accessibility.accessibility_value_min as f64);
            }
            if accessibility.accessibility_has_value_max {
                node.set_max_numeric_value(accessibility.accessibility_value_max as f64);
            }
            if accessibility.accessibility_has_value_now {
                node.set_numeric_value(accessibility.accessibility_value_now as f64);
            }
            let value = if is_text_input {
                if input_secure_text || input_text.is_empty() {
                    None
                } else {
                    Some(input_text.as_str())
                }
            } else if !accessibility.accessibility_value_text.is_empty() {
                Some(accessibility.accessibility_value_text.as_str())
            } else {
                None
            };
            if let Some(value) = value {
                node.set_value(value);
            }
            if is_text_input && !input_placeholder.is_empty() {
                node.set_placeholder(input_placeholder);
            }
            if is_text_input {
                if !input_editable {
                    node.set_read_only();
                }
                if input_secure_text {
                    node.set_value("");
                }
            }
            node.set_custom_actions(
                accessibility
                    .accessibility_actions
                    .iter()
                    .filter(|action| accessibility_action_for_name(&action.name).is_none())
                    .enumerate()
                    .map(|(index, action)| gpui::accesskit::CustomAction {
                        id: index as i32,
                        description: if action.label.is_empty() {
                            action.name.clone().into_boxed_str()
                        } else {
                            action.label.clone().into_boxed_str()
                        },
                    })
                    .collect::<Vec<_>>(),
            );
            #[cfg(feature = "visual-capture")]
            if std::env::var_os("RN_GPUI_DEBUG_A11Y_TREE").is_some() {
                let snapshot = serde_json::json!({
                    "tag": accessibility_tag,
                    "id": accessibility.test_id,
                    "role": format!("{:?}", node.role()),
                    "label": node.label(),
                    "value": node.value(),
                    "hidden": node.is_hidden(),
                    "disabled": node.is_disabled(),
                    "modal": node.is_modal(),
                    "escapeListener": accessibility.accessibility_has_escape_listener,
                    "language": node.language(),
                    "live": node.live().map(|value| format!("{value:?}")),
                    "position": node.position_in_set(),
                    "size": node.size_of_set(),
                    "customActions": node.custom_actions().iter().map(|action| action.description.as_ref()).collect::<Vec<_>>(),
                }).to_string();
                static SNAPSHOTS: OnceLock<Mutex<HashMap<i32, String>>> = OnceLock::new();
                let mut snapshots = SNAPSHOTS.get_or_init(Mutex::default).lock().unwrap();
                if snapshots.get(&accessibility_tag) != Some(&snapshot) {
                    log::info!("[a11y-node] {snapshot}");
                    snapshots.insert(accessibility_tag, snapshot);
                }
            }
        });
        let has_accessibility_focus_target =
            self.view.accessible || self.accessibility_role().is_some();
        let mut focus_child = None;
        if self.focusable
            || self.view.accessibility_has_escape_listener
            || has_accessibility_focus_target
        {
            if self.focus_handle.is_none() {
                let handle = cx
                    .focus_handle()
                    .tab_stop(self.focusable || self.view.accessibility_has_escape_listener)
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
            self.set_accessibility_tab_stop_allowed(
                !hidden_by_active_modal
                    && !hidden_by_modal_sibling
                    && !hidden_by_inactive_screen_ancestor
                    && !hidden_inactive_screen
                    && !self.inherited.hidden_by_hidden_ancestor
                    && !self.inherited.hidden_by_accessible_ancestor,
            );
            if let Some(handle) = &self.focus_handle {
                if accessibility_active || is_scroll {
                    // The accessibility tree needs the role, the label and the focus on one
                    // element.
                    element = element.track_focus(handle);
                } else {
                    // `track_focus` forces a div hitbox, and a div asks whether it is hovered
                    // while painting; a zero-sized child's hitbox is never hovered.
                    focus_child = Some(div().absolute().size_0().track_focus(handle));
                }
            }
            element = element
                .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                    dispatch_key(this.tag, "topKeyDown", &event.keystroke, event.is_held, cx);
                    if !event.is_held
                        && focus_adjacent_semantic_sibling(this, &event.keystroke.key, window, cx)
                    {
                        cx.stop_propagation();
                    }
                    if !event.is_held
                        && matches!(event.keystroke.key.as_str(), "enter" | "space")
                        && this.component != "TextInput"
                        && matches!(
                            this.accessibility_role(),
                            Some(
                                Role::Button
                                    | Role::DefaultButton
                                    | Role::CheckBox
                                    | Role::RadioButton
                                    | Role::Switch
                                    | Role::Link
                            )
                        )
                    {
                        dispatch_accessibility_event(
                            this.tag,
                            "click",
                            &serde_json::json!({}),
                            window,
                            cx,
                        );
                        cx.stop_propagation();
                    }
                    if event.keystroke.key == "escape" {
                        #[cfg(feature = "visual-capture")]
                        log::info!(
                            "[accessibility] Escape tag={} target={:?}",
                            this.tag,
                            this.accessibility_escape_target(cx)
                        );
                        if let Some(tag) = this.accessibility_escape_target(cx) {
                            dispatch_accessibility_event(
                                tag,
                                "accessibilityEscape",
                                &serde_json::json!({}),
                                window,
                                cx,
                            );
                            cx.stop_propagation();
                        }
                    }
                    let primary_modifier = if cfg!(target_os = "macos") {
                        event.keystroke.modifiers.platform
                    } else {
                        event.keystroke.modifiers.control
                    };
                    if this.component == "TextInput"
                        && primary_modifier
                        && event.keystroke.key == "a"
                        && !event.keystroke.modifiers.alt
                    {
                        crate::input::select_all(this, window, cx);
                        cx.stop_propagation();
                    }
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
        if self.view.accessibility_responds_to_interaction && !self.view.accessibility_disabled {
            let tag = self.tag;
            let actions = self.view.accessibility_actions.clone();
            let has_activate_action = actions.iter().any(|action| action.name == "activate");
            if !has_activate_action
                && (self.focusable
                    || self.view.accessibility_has_tap_listener
                    || matches!(
                        self.accessibility_role(),
                        Some(
                            Role::Button
                                | Role::DefaultButton
                                | Role::CheckBox
                                | Role::RadioButton
                                | Role::Switch
                                | Role::Link
                                | Role::Tab
                                | Role::MenuItem
                        )
                    ))
            {
                let has_tap_listener = self.view.accessibility_has_tap_listener;
                element = element.on_a11y_action(
                    gpui::AccessibleAction::Click,
                    move |_data, window, cx| {
                        dispatch_accessibility_event(
                            tag,
                            "click",
                            &serde_json::json!({}),
                            window,
                            cx,
                        );
                        if has_tap_listener {
                            dispatch_accessibility_event(
                                tag,
                                "accessibilityTap",
                                &serde_json::json!({}),
                                window,
                                cx,
                            );
                        }
                    },
                );
            }
            for action in actions.iter().filter_map(|action| {
                accessibility_action_for_name(&action.name)
                    .map(|native_action| (native_action, action.name.clone()))
            }) {
                let (native_action, name) = action;
                let dispatch = self.view.accessibility_has_action_listener;
                let tap = name == "activate" && self.view.accessibility_has_tap_listener;
                element = element.on_a11y_action(native_action, move |_data, window, cx| {
                    if name == "activate" {
                        dispatch_accessibility_event(
                            tag,
                            "click",
                            &serde_json::json!({}),
                            window,
                            cx,
                        );
                    }
                    if dispatch {
                        dispatch_accessibility_event(
                            tag,
                            "accessibilityAction",
                            &serde_json::json!({"actionName": name}),
                            window,
                            cx,
                        );
                    }
                    if tap {
                        dispatch_accessibility_event(
                            tag,
                            "accessibilityTap",
                            &serde_json::json!({}),
                            window,
                            cx,
                        );
                    }
                });
            }
            let custom_actions = actions
                .into_iter()
                .filter(|action| accessibility_action_for_name(&action.name).is_none())
                .collect::<Vec<_>>();
            if !custom_actions.is_empty() && self.view.accessibility_has_action_listener {
                let tag = self.tag;
                element = element.on_a11y_action(
                    gpui::AccessibleAction::CustomAction,
                    move |data, window, cx| {
                        let Some(gpui::accesskit::ActionData::CustomAction(id)) = data else {
                            return;
                        };
                        let Some(action) = custom_actions.get(*id as usize) else {
                            return;
                        };
                        dispatch_accessibility_event(
                            tag,
                            "accessibilityAction",
                            &serde_json::json!({"actionName": action.name}),
                            window,
                            cx,
                        );
                    },
                );
            }
        }
        // A portal decides what a close request means; Escape is the desktop's
        // way of asking. The component names the event, so core does not.
        if let Some(close_event) = crate::extensions::component_portal(
            &self.component,
            &crate::extensions::parse_extension_props(&self.extension_props_json),
        )
        .filter(|portal| portal.visible)
        .and_then(|portal| portal.close_request_event)
        {
            element =
                element.on_key_down(cx.listener(move |this, event: &KeyDownEvent, window, cx| {
                    if event.keystroke.key != "escape" {
                        return;
                    }
                    if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                        let store = store.0.read(cx);
                        store
                            .host
                            .dispatch_event(this.tag, &close_event, &serde_json::json!({}));
                        store.frame_hook.arm(window);
                    }
                    cx.stop_propagation();
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
                            .filter(|_| {
                                !cx.reduce_motion()
                                    && !crate::animation_policy::animations_disabled()
                            });
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
                // react-native-screens may mark the outgoing view inactive in the commit that
                // inserts its replacement; keep it painted until the transition ends.
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
        // The listeners live on a `pointer_area` child, not on the node's own div: a
        // div with a hitbox records a hover read while painting, which makes a scroll
        // under a still pointer rebuild every row. It is the first child so its
        // hitbox and handlers keep the order the node's own div would give them.
        let mut handlers = PointerHandlers::default();
        if self.view.on_context_menu {
            let node = cx.entity().downgrade();
            handlers
                .right_down
                .push(Rc::new(move |event: &MouseDownEvent, window, cx| {
                    let Some(node) = node.upgrade() else {
                        return;
                    };
                    let (tag, surface_id) = {
                        let this = node.read(cx);
                        (this.tag, this.surface_id)
                    };
                    let x = f32::from(event.position.x);
                    let y = f32::from(event.position.y);
                    let window_id = cx
                        .try_global::<crate::desktop::windows::DesktopWindowsGlobal>()
                        .and_then(|windows| {
                            windows
                                .0
                                .entry_for_surface(surface_id)
                                .map(|entry| entry.key)
                        })
                        .unwrap_or(crate::desktop::windows::MAIN_WINDOW_KEY);
                    if let Some(store) = cx.try_global::<crate::store::StoreGlobal>() {
                        let store = store.0.read(cx);
                        store.host.dispatch_event(
                            tag,
                            "topContextMenu",
                            &serde_json::json!({
                                "x": x,
                                "y": y,
                                "pageX": x,
                                "pageY": y,
                                "windowId": window_id,
                            }),
                        );
                        store.frame_hook.arm(window);
                    }
                    cx.stop_propagation();
                }));
        }
        // Registered before the RN touch handler so the drag region sees the press;
        // a child's handler runs first and stops propagation, so buttons inside
        // the bar keep working.
        if self.view.desktop_drag_region || !self.view.desktop_window_control.is_empty() {
            let control = self.view.desktop_window_control.clone();
            let drag_region = self.view.desktop_drag_region;
            handlers
                .left_down
                .push(Rc::new(move |event: &MouseDownEvent, window, cx| {
                    if !control.is_empty() {
                        match control.as_str() {
                            "minimize" => window.minimize_window(),
                            "maximize" => window.zoom_window(),
                            "close" => window.remove_window(),
                            _ => {}
                        }
                        cx.stop_propagation();
                        return;
                    }
                    if drag_region {
                        if event.click_count >= 2 {
                            window.titlebar_double_click();
                        } else {
                            window.start_window_move();
                        }
                        cx.stop_propagation();
                    }
                }));
        }
        if self.view.pointer_events != crate::events::POINTER_EVENTS_NONE {
            let node = cx.entity().downgrade();
            let down_node = node.clone();
            handlers
                .left_down
                .push(Rc::new(move |event: &MouseDownEvent, window, cx| {
                    let Some(node) = down_node.upgrade() else {
                        return;
                    };
                    let (target, focus_handle, is_text_input) = {
                        let this = node.read(cx);
                        (
                            crate::events::target(cx, this),
                            this.nearest_focus_handle(cx),
                            this.component == "TextInput",
                        )
                    };
                    let Some(target) = target else {
                        return;
                    };
                    if let Some(handle) = focus_handle {
                        window.focus(&handle, cx);
                    }
                    if is_text_input {
                        node.update(cx, |this, cx| {
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
                        });
                    }
                    crate::events::send(
                        window,
                        cx,
                        &target,
                        event.position,
                        crate::events::Phase::Start,
                    );
                    cx.stop_propagation();
                }));
            // Not `cx.listener`: a listener updates its entity every time it runs, and
            // gpui-fast rebuilds any view that read an updated entity.
            let move_node = node.clone();
            handlers
                .mouse_move
                .push(Rc::new(move |event: &MouseMoveEvent, window, cx| {
                    let Some(node) = move_node.upgrade() else {
                        return;
                    };
                    let (hit_target, selecting) = {
                        let this = node.read(cx);
                        (
                            crate::events::target(cx, this),
                            this.component == "TextInput" && this.input_selection_anchor.is_some(),
                        )
                    };
                    if event.pressed_button.is_some() {
                        if selecting {
                            node.update(cx, |this, cx| {
                                crate::input::select_at_point(
                                    this,
                                    event.position,
                                    true,
                                    window,
                                    cx,
                                );
                            });
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
                        crate::events::hover(window, cx, hit_target.as_ref(), event.position);
                    }
                    if hit_target.is_some() || crate::events::active_touch_target(cx).is_some() {
                        cx.stop_propagation();
                    }
                }));
            handlers
                .left_up
                .push(Rc::new(move |event: &MouseUpEvent, window, cx| {
                    let Some(node) = node.upgrade() else {
                        return;
                    };
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
                    let is_touch_target = {
                        let this = node.read(cx);
                        crate::events::target(cx, this).is_some()
                    };
                    if active_target.is_some() || is_touch_target {
                        cx.stop_propagation();
                    }
                }));
        }
        // A child of a scrolling container moves with its content, so a pointer area
        // here would drift off the viewport.
        if is_scroll {
            for handler in handlers.right_down {
                element = element.on_mouse_down(MouseButton::Right, move |event, window, cx| {
                    handler(event, window, cx)
                });
            }
            for handler in handlers.left_down {
                element = element.on_mouse_down(MouseButton::Left, move |event, window, cx| {
                    handler(event, window, cx)
                });
            }
            for handler in handlers.left_up {
                element = element.on_mouse_up(MouseButton::Left, move |event, window, cx| {
                    handler(event, window, cx)
                });
            }
            for handler in handlers.mouse_move {
                element =
                    element.on_mouse_move(move |event, window, cx| handler(event, window, cx));
            }
        } else {
            if !handlers.is_empty() {
                element = element.child(pointer_area(handlers));
            }
            if let Some(focus_child) = focus_child {
                element = element.child(focus_child);
            }
        }
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
                let viewport_width = (frame.w * scale_x - left - right).max(0.0);
                let viewport_height = (frame.h * scale_y - top - bottom).max(0.0);
                if !self.input_multiline {
                    // A single-line input is a clipped viewport, not a wrapping paragraph: shape
                    // the whole line so its tail is never hidden at the field edge.
                    scaled_paragraph.max_lines = 0;
                    scaled_paragraph.ellipsize = 0;
                    let line = self.input_text.split('\n').next().unwrap_or_default();
                    let natural_width = crate::text::input_caret_x(
                        window.text_system(),
                        &scaled_paragraph,
                        line,
                        line.len(),
                    );
                    let text_width = viewport_width.max(natural_width + 2.0);
                    element = element.child(
                        div()
                            .absolute()
                            .left(px(left))
                            .top(px(top))
                            .w(px(viewport_width))
                            .h(px(viewport_height))
                            .overflow_hidden()
                            .child(
                                div()
                                    .absolute()
                                    .left(px(-self.input_scroll_x * scale_x))
                                    .top_0()
                                    .w(px(text_width))
                                    .h(px(viewport_height))
                                    .child(crate::text::paragraph_element(
                                        &scaled_paragraph,
                                        text_width,
                                        viewport_height,
                                    )),
                            ),
                    );
                } else {
                    element = element.child(
                        div()
                            .absolute()
                            .left(px(left))
                            .top(px(top))
                            .w(px(viewport_width))
                            .h(px(viewport_height))
                            .child(crate::text::paragraph_element(
                                &scaled_paragraph,
                                viewport_width,
                                viewport_height,
                            )),
                    );
                }
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
            let mut caret_paragraph = self.paragraph.clone().unwrap_or_default();
            for fragment in &mut caret_paragraph.fragments {
                fragment.font_size *= scale_y;
                fragment.letter_spacing *= scale_x;
            }
            let input_selection = self.input_selection.clone();
            let content_insets = self.view.content_insets;
            let input_text_color = self.input_text_color;
            let input_selection_color = self.input_selection_color;
            let input_multiline = self.input_multiline;
            let input_scroll_x = self.input_scroll_x * scale_x;
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
                                    let content_width = (f32::from(bounds.size.width)
                                        - (content_insets.left + content_insets.right) * scale_x)
                                        .max(0.0);
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
                                            let mut x0 = crate::text::input_caret_x(
                                                window.text_system(),
                                                &caret_paragraph,
                                                prefix,
                                                prefix.len(),
                                            );
                                            let mut x1 = crate::text::input_caret_x(
                                                window.text_system(),
                                                &caret_paragraph,
                                                through_selection,
                                                through_selection.len(),
                                            );
                                            if !input_multiline {
                                                x0 -= input_scroll_x;
                                                x1 -= input_scroll_x;
                                                x0 = x0.clamp(0.0, content_width);
                                                x1 = x1.clamp(0.0, content_width);
                                            }
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
                                    let mut x = x - input_scroll_x;
                                    let content_width = (f32::from(bounds.size.width)
                                        - (content_insets.left + content_insets.right) * scale_x)
                                        .max(0.0);
                                    if !input_multiline {
                                        x = x.clamp(
                                            0.0,
                                            (content_width - scale_x.max(1.0)).max(0.0),
                                        );
                                    }
                                    let x = bounds.origin.x + px(content_insets.left * scale_x + x);
                                    let y = bounds.origin.y
                                        + px(content_insets.top * scale_y
                                            + line_number as f32 * caret_height);
                                    let caret = gpui::Bounds {
                                        origin: point(x, y),
                                        size: gpui::size(px(scale_x.max(1.0)), px(caret_height)),
                                    };
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
        if is_scroll {
            let (content_width, content_height) = self.content_size;
            let mut content = div()
                .relative()
                .flex_none()
                .w(px(content_width.max(frame.w)))
                .h(px(content_height.max(frame.h)));
            content = content.children(ordered_children.iter().map(|(_, child)| child.clone()));
            // The handle is only written when React or a layout change moved
            // the offset. Writing it on every render would count as a scroll.
            if std::mem::take(&mut self.scroll_handle_stale) {
                self.scroll_handle.set_offset(point(
                    px(-self.scroll_offset().x * scale_x),
                    px(-self.scroll_offset().y * scale_y),
                ));
            }
            if self.scroll_enabled {
                // GPUI scrolls this container itself, which lets gpui-fast composite the
                // content as a scroll layer. This listener runs before GPUI's, so it defers
                // and reports where the offset ended up.
                let scroller = Rc::new(Scroller {
                    tag: self.tag,
                    position: self.scroll_position.clone(),
                    handle: self.scroll_handle.clone(),
                    sync_generation: self.scroll_sync_generation.clone(),
                    content_size: self.content_size,
                    viewport: (frame.w, frame.h),
                    scale: (scale_x, scale_y),
                });
                content =
                    content.on_scroll_wheel(move |_event: &gpui::ScrollWheelEvent, window, cx| {
                        let scroller = scroller.clone();
                        window.defer(cx, move |window, cx| scroller.sync(window, cx));
                    });
            }
            // The scrolling container is a child filling this node, not the
            // node's own element: whatever sits inside a scrolling container
            // moves with its content, and the indicator must not.
            let mut scroller = div().id("scroller").absolute().top_0().left_0().size_full();
            scroller = if !self.scroll_enabled {
                scroller.overflow_hidden()
            } else if self.scroll_horizontal {
                scroller.overflow_x_scroll().overflow_y_hidden()
            } else {
                scroller.overflow_y_scroll().overflow_x_hidden()
            };
            element = element
                .overflow_hidden()
                .child(scroller.track_scroll(&self.scroll_handle).child(content));
            if self.scroll_indicator_enabled && self.scroll_enabled {
                let horizontal = self.scroll_horizontal;
                if self
                    .scroll_indicator
                    .as_ref()
                    .is_none_or(|indicator| indicator.read(cx).horizontal() != horizontal)
                {
                    let handle = self.scroll_handle.clone();
                    self.scroll_indicator = Some(cx.new(|_| {
                        crate::scroll_indicator::ScrollIndicator::new(handle, horizontal)
                    }));
                }
                element = element.children(self.scroll_indicator.clone());
            } else {
                self.scroll_indicator = None;
            }
        } else {
            let is_modal = self.component == "RNSScreen"
                && matches!(
                    self.screen_stack_presentation.as_str(),
                    "modal" | "transparentModal" | "containedModal" | "formSheet"
                );
            if is_modal {
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
                        .children(ordered_children.iter().map(|(_, child)| child.clone())),
                );
            } else {
                // A module may contribute this component's own content while
                // core keeps the styled box and its accessibility: that is how
                // a built-in component moves onto the extension API without
                // losing the properties every View has.
                let content =
                    crate::extensions::component_renderer(&self.component).and_then(|renderer| {
                        let node = self.component_node(cx);
                        renderer.content(&node, window, cx)
                    });
                element = element.children(
                    content.into_iter().chain(
                        ordered_children
                            .iter()
                            .map(|(_, child)| child.clone().into_any_element()),
                    ),
                );
            }
            if self.component == "TextInput" && !self.input_multiline {
                element = element.on_scroll_wheel(cx.listener(
                    |this, event: &gpui::ScrollWheelEvent, window, cx| {
                        let delta = match &event.delta {
                            gpui::ScrollDelta::Pixels(delta) => {
                                let x = f32::from(delta.x);
                                if x.abs() > 0.0 {
                                    x
                                } else {
                                    f32::from(delta.y)
                                }
                            }
                            gpui::ScrollDelta::Lines(lines) => {
                                if lines.x.abs() > 0.0 {
                                    lines.x * 40.0
                                } else {
                                    lines.y * 40.0
                                }
                            }
                        };
                        let viewport = (this.frame.w
                            - this.view.content_insets.left
                            - this.view.content_insets.right)
                            .max(0.0);
                        let natural_width = this
                            .paragraph
                            .as_ref()
                            .map(|paragraph| {
                                let line = this.input_text.split('\n').next().unwrap_or_default();
                                crate::text::input_caret_x(
                                    window.text_system(),
                                    paragraph,
                                    line,
                                    line.len(),
                                )
                            })
                            .unwrap_or(0.0);
                        let max_offset = (natural_width - viewport).max(0.0);
                        let next = (this.input_scroll_x - delta).clamp(0.0, max_offset);
                        if (next - this.input_scroll_x).abs() > f32::EPSILON {
                            this.input_scroll_x = next;
                            cx.notify();
                            cx.stop_propagation();
                        }
                    },
                ));
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
        if window.last_input_was_keyboard()
            && self
                .focus_handle
                .as_ref()
                .is_some_and(|focus| focus.is_focused(window))
        {
            let focus_color = 0xff60a5fa;
            let ring = 2.0;
            outline_rules.extend(rule_segments(
                -ring,
                -ring,
                width + ring * 2.0,
                ring,
                true,
                focus_color,
                0,
            ));
            outline_rules.extend(rule_segments(
                -ring,
                height,
                width + ring * 2.0,
                ring,
                true,
                focus_color,
                0,
            ));
            outline_rules.extend(rule_segments(
                -ring,
                0.0,
                height,
                ring,
                false,
                focus_color,
                0,
            ));
            outline_rules.extend(rule_segments(
                width,
                0.0,
                height,
                ring,
                false,
                focus_color,
                0,
            ));
        }
        element.children(outline_rules).into_any_element()
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

const SCROLL_STATE_SYNC_DELAY: std::time::Duration = std::time::Duration::from_millis(100);

impl RNNodeView {
    pub fn scroll_offset(&self) -> Point<f32> {
        self.scroll_position.get()
    }

    /// The read-only view of this component handed to a module's renderer or
    /// The JSON a module filled for this component, unparsed.
    pub(crate) fn extension_props_json(&self) -> &str {
        &self.extension_props_json
    }

    /// observer. `extension_props_json` is parsed here, once per call.
    pub(crate) fn component_node(&self, cx: &App) -> crate::extensions::ComponentNode {
        let props = if self.extension_props_json.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::from_str(&self.extension_props_json).unwrap_or(serde_json::Value::Null)
        };
        crate::extensions::ComponentNode {
            component: self.component.clone(),
            tag: self.tag,
            frame: self.frame,
            props,
            children: self
                .children
                .iter()
                .map(|(_, child)| child.read(cx).component_node(cx))
                .collect(),
        }
    }
}

struct Scroller {
    tag: i32,
    position: Rc<Cell<Point<f32>>>,
    handle: gpui::ScrollHandle,
    sync_generation: Rc<Cell<u64>>,
    content_size: (f32, f32),
    viewport: (f32, f32),
    scale: (f32, f32),
}

impl Scroller {
    fn sync(&self, window: &mut Window, cx: &mut App) {
        let scrolled = self.handle.offset();
        let offset = point(
            -f32::from(scrolled.x) / self.scale.0.max(f32::EPSILON),
            -f32::from(scrolled.y) / self.scale.1.max(f32::EPSILON),
        );
        let old = self.position.get();
        if (offset.x - old.x).abs() < 0.01 && (offset.y - old.y).abs() < 0.01 {
            return;
        }
        self.position.set(offset);
        let Some(store) = cx.try_global::<crate::store::StoreGlobal>() else {
            return;
        };
        let (host, frame_hook) = {
            let store = store.0.read(cx);
            (store.host.clone(), store.frame_hook.clone())
        };
        let payload = serde_json::json!({
            "contentOffset": {"x": offset.x, "y": offset.y},
            "contentSize": {"width": self.content_size.0, "height": self.content_size.1},
            "layoutMeasurement": {"width": self.viewport.0, "height": self.viewport.1},
            "zoomScale": 1
        });
        host.dispatch_event(self.tag, "topScroll", &payload);
        frame_hook.arm(window);
        // Fabric's copy of the offset costs a commit per update, so it follows once
        // scrolling pauses.
        let generation = self.sync_generation.get() + 1;
        self.sync_generation.set(generation);
        let (tag, position, sync_generation) = (
            self.tag,
            self.position.clone(),
            self.sync_generation.clone(),
        );
        cx.spawn(async move |cx| {
            cx.background_executor()
                .timer(SCROLL_STATE_SYNC_DELAY)
                .await;
            if sync_generation.get() == generation {
                let offset = position.get();
                host.set_scroll_offset(tag, offset.x, offset.y);
            }
        })
        .detach();
    }
}

pub(crate) fn decode_data_image(data: &str) -> Option<gpui::Image> {
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
