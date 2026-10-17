//! Painting react-native-screens through the generic renderer hooks.
//!
//! Core builds a box, a background and an accessibility node for every
//! component. What is screens-specific — which screen is on top, where a header
//! subview sits, whether a card is showing — is decided here, from the props this
//! module's C++ half produced and a read-only view of the tree.
use crate::props;
use crate::stack::{
    CONTENT_WRAPPER, FULL_WINDOW_OVERLAY, HEADER_CONFIG, HEADER_SUBVIEW, MODAL_SCREEN, SCREEN,
    STACK,
};
use gpui::{div, prelude::*, AnyElement, App, MouseButton, SharedString, Window};
use react_native_gpui::extensions::{
    store_handle, ComponentNode, ComponentRenderer, Decoration, Portal, StoreHandle, TreeView,
};
use rn_gpui_sys::ffi::RectF;

/// The header bar's height, which the content wrapper is inset by.
pub const HEADER_HEIGHT: f32 = 56.0;

/// A screen inside a stack.
pub struct ScreenRenderer;

impl ComponentRenderer for ScreenRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn hides_subtree(&self, node: &ComponentNode, tree: &TreeView) -> bool {
        if props::activity_state(node) > 0.0 {
            return false;
        }
        if tree
            .transition(node.tag)
            .is_some_and(|state| state.progress < 1.0)
        {
            return false;
        }
        !covered_by_modal_sibling(node, tree)
    }

    fn decorate(&self, node: &ComponentNode, tree: &TreeView) -> Decoration {
        if props::activity_state(node) > 0.0 {
            return Decoration::default();
        }
        let transitioning = tree
            .transition(node.tag)
            .is_some_and(|state| state.progress < 1.0);
        let visible_under_modal = covered_by_modal_sibling(node, tree);
        if !transitioning && !visible_under_modal {
            return Decoration {
                display: Some(false),
                ..Decoration::default()
            };
        }
        Decoration::default()
    }
}

/// Whether a later sibling in the same stack is an active modal presentation.
fn covered_by_modal_sibling(node: &ComponentNode, tree: &TreeView) -> bool {
    let Some(parent) = node.parent else {
        return false;
    };
    let siblings = tree.children(parent);
    let Some(position) = siblings.iter().position(|tag| *tag == node.tag) else {
        return false;
    };
    siblings
        .into_iter()
        .skip(position + 1)
        .filter_map(|tag| tree.node(tag))
        .any(|sibling| {
            sibling.component == SCREEN
                && props::activity_state(&sibling) > 0.0
                && props::is_modal_presentation(&sibling)
        })
}

/// The stack itself: it clips, and it owns the Escape gesture.
pub struct StackRenderer;

impl ComponentRenderer for StackRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn decorate(&self, _node: &ComponentNode, _tree: &TreeView) -> Decoration {
        Decoration {
            clip: true,
            ..Decoration::default()
        }
    }

    fn handles_keys(&self, _node: &ComponentNode) -> bool {
        true
    }

    fn on_key_down(
        &self,
        node: &ComponentNode,
        key: &str,
        tree: &TreeView,
        handle: &react_native_gpui::extensions::StoreHandle,
        _window: &mut Window,
        _cx: &mut App,
    ) -> bool {
        if key != "escape" {
            return false;
        }
        if has_screen_ancestor(node, tree) {
            return false;
        }
        let screens: Vec<i32> = tree
            .children(node.tag)
            .into_iter()
            .filter(|tag| {
                tree.is_live(*tag) && tree.node(*tag).is_some_and(|n| n.component == SCREEN)
            })
            .collect();
        let Some(top) = screens.last().copied() else {
            return false;
        };
        if crate::state::with(|state| state.native_dismiss_pending.is_some()) {
            return true;
        }
        dismiss_top(top, node.tag, tree, handle, _cx);
        true
    }
}

/// Whether any ancestor of `node` is a screen, i.e. this stack is nested.
fn has_screen_ancestor(node: &ComponentNode, tree: &TreeView) -> bool {
    tree.ancestors(node.tag)
        .into_iter()
        .filter_map(|tag| tree.node(tag))
        .any(|ancestor| ancestor.component == SCREEN)
}

/// The header bar: a background, a title and a back button.
pub struct HeaderConfigRenderer;

impl ComponentRenderer for HeaderConfigRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn layout_frame(&self, node: &ComponentNode, tree: &TreeView) -> Option<RectF> {
        let mut frame = node.frame;
        frame.y += tree.window_top_inset();
        frame.h = if props::header_hidden(node) || !is_top_header(node, tree) {
            0.0
        } else {
            HEADER_HEIGHT
        };
        Some(frame)
    }

    fn hides_subtree(&self, node: &ComponentNode, tree: &TreeView) -> bool {
        props::header_hidden(node) || !is_top_header(node, tree)
    }

    fn decorate(&self, node: &ComponentNode, tree: &TreeView) -> Decoration {
        let top = is_top_header(node, tree);
        let shown = should_show_back(node, tree);
        crate::state::set_header_facts(node.tag, top, shown, has_title_subview(node, tree));
        if props::header_hidden(node) || !top {
            return Decoration {
                display: Some(false),
                ..Decoration::default()
            };
        }
        let background = first_nonzero(props::header_background_color(node), 0xff171923);
        Decoration {
            background: Some(background),
            ..Decoration::default()
        }
    }

    fn depends_on_window_insets(&self) -> bool {
        true
    }

    fn content(
        &self,
        node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        if props::header_hidden(node) || !crate::state::header_is_top(node.tag) {
            return None;
        }
        let node_tag = node.tag;
        let title_color = first_nonzero(props::header_title_color(node), 0xffffffff);
        let mut bar = div()
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .text_color(argb(title_color))
            .text_size(gpui::px(18.0));
        if !crate::state::header_has_title_subview(node.tag) {
            bar = bar.child(SharedString::from(props::header_title(node).to_string()));
        }
        if crate::state::header_shows_back(node.tag) {
            bar = bar.child(
                div()
                    .absolute()
                    .left_0()
                    .top_0()
                    .h(gpui::px(HEADER_HEIGHT))
                    .w(gpui::px(HEADER_HEIGHT))
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_color(argb(first_nonzero(
                        props::header_tint_color(node),
                        0xffffffff,
                    )))
                    .text_size(gpui::px(30.0))
                    .cursor_pointer()
                    .child("‹")
                    .on_mouse_down(MouseButton::Left, move |_event, window, cx| {
                        if let Some(handle) = store_handle(cx) {
                            handle.dispatch_event(
                                node_tag,
                                "headerBackButtonClicked",
                                &serde_json::json!({}),
                                cx,
                            );
                            handle.request_frame(window);
                        }
                        cx.stop_propagation();
                    }),
            );
        }
        Some(bar.into_any_element())
    }
}

/// Escape dismisses the top screen the way a native gesture would.
///
/// The card runs its exit animation, the screen gets the `will` pair, and only
/// when the animation ends does it get the final progress, the `did` pair and
/// `topDismissed`. `native_dismiss_pending` tells the stack observer that this
/// dismissal already ran its animation, so it must not run a second one.
fn dismiss_top(top: i32, stack: i32, tree: &TreeView, handle: &StoreHandle, cx: &mut App) {
    crate::state::with(|state| state.native_dismiss_pending = Some(top));
    let incoming = previous_screen(top, stack, tree);
    crate::lifecycle::dispatch_will(handle, Some(top), incoming, cx);
    let animation = tree
        .node(stack)
        .map(|node| props::stack_animation(&node).to_string())
        .unwrap_or_default();
    let mode = crate::transition::transition_mode(&animation);
    let duration = mode.map(|mode| mode.duration());
    if let Some(mode) = mode {
        let exit = crate::transition::transition(mode, crate::transition::Role::Exit, 1.0);
        crate::state::with(|state| {
            state.roles.insert(top, (crate::state::Role::Exit, 1.0));
        });
        handle.start_transition(top, exit, cx);
    }
    let finish = move |handle: &StoreHandle, cx: &mut App| {
        crate::state::with(|state| state.native_dismiss_pending = None);
        handle.dispatch_event(
            top,
            "topTransitionProgress",
            &serde_json::json!({"progress": 1, "closing": 1, "goingForward": 0}),
            cx,
        );
        crate::lifecycle::dispatch_did(handle, Some(top), incoming, cx);
        handle.dispatch_event(
            top,
            "topDismissed",
            &serde_json::json!({ "dismissCount": 1 }),
            cx,
        );
    };
    match duration {
        Some(duration) => handle.after(duration, cx, finish),
        None => finish(handle, cx),
    }
}

/// A Fabric colour as GPUI sees it, alpha included.
fn argb(color: u32) -> gpui::Hsla {
    let alpha = color >> 24;
    gpui::rgba((color << 8) | alpha).into()
}

fn first_nonzero(value: u32, fallback: u32) -> u32 {
    if value == 0 {
        fallback
    } else {
        value
    }
}

/// Whether the screen has a previous live screen in its stack to go back to.
fn should_show_back(node: &ComponentNode, tree: &TreeView) -> bool {
    if props::header_hide_back(node) {
        return false;
    }
    let Some(screen) = node.parent else {
        return false;
    };
    let Some(stack) = stack_of(screen, tree) else {
        return false;
    };
    let screens: Vec<i32> = tree
        .children(stack)
        .into_iter()
        .filter(|tag| tree.is_live(*tag) && tree.node(*tag).is_some_and(|n| n.component == SCREEN))
        .collect();
    screens
        .iter()
        .position(|tag| *tag == screen)
        .is_some_and(|position| position > 0)
}

/// Whether this header belongs to the screen currently on top of its stack.
fn is_top_header(node: &ComponentNode, tree: &TreeView) -> bool {
    let Some(parent) = node.parent else {
        return true;
    };
    let Some(stack) = stack_of(parent, tree) else {
        return true;
    };
    let screens: Vec<i32> = tree
        .children(stack)
        .into_iter()
        .filter(|tag| tree.node(*tag).is_some_and(|n| n.component == SCREEN))
        .collect();
    let is_last = screens.last().copied() == Some(parent);
    // A screen that is leaving keeps its header while its transition runs, so
    // the header does not blink out before the card has finished moving.
    is_last || tree.transition(parent).is_some()
}

/// Whether the header config carries a `title` subview.
fn has_title_subview(config: &ComponentNode, tree: &TreeView) -> bool {
    tree.children(config.tag)
        .into_iter()
        .filter_map(|tag| tree.node(tag))
        .any(|child| child.component == HEADER_SUBVIEW && props::subview_type(&child) == "title")
}

/// The live screen directly below `top` in its stack, if any.
fn previous_screen(top: i32, stack: i32, tree: &TreeView) -> Option<i32> {
    let screens: Vec<i32> = tree
        .children(stack)
        .into_iter()
        .filter(|tag| tree.is_live(*tag) && tree.node(*tag).is_some_and(|n| n.component == SCREEN))
        .collect();
    let index = screens.iter().position(|tag| *tag == top)?;
    index.checked_sub(1).and_then(|i| screens.get(i)).copied()
}

/// The stack a screen sits in, walking up past intermediate containers.
fn stack_of(screen: i32, tree: &TreeView) -> Option<i32> {
    tree.ancestors(screen)
        .into_iter()
        .find(|tag| tree.node(*tag).is_some_and(|n| n.component == STACK))
}

/// A header subview: positioned by its declared type.
pub struct HeaderSubviewRenderer;

impl ComponentRenderer for HeaderSubviewRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn layout_frame(&self, node: &ComponentNode, tree: &TreeView) -> Option<RectF> {
        let mut frame = node.frame;
        let Some(config) = node.parent else {
            return Some(frame);
        };
        let container_width = tree
            .node(config)
            .map(|config| config.frame.w)
            .unwrap_or(frame.w);
        let tallest = tree
            .children(node.tag)
            .into_iter()
            .filter_map(|tag| tree.node(tag))
            .fold(0.0f32, |height, child| height.max(child.frame.h));
        frame.x = match props::subview_type(node) {
            "right" => container_width - frame.w - 12.0,
            "center" | "title" => (container_width - frame.w) / 2.0,
            "left" => 12.0,
            _ => frame.x,
        };
        frame.y = ((HEADER_HEIGHT - tallest).max(0.0)) / 2.0;
        Some(frame)
    }
}

/// A screen's content area, inset by the header when one is showing.
pub struct ContentWrapperRenderer;

impl ComponentRenderer for ContentWrapperRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn layout_frame(&self, node: &ComponentNode, tree: &TreeView) -> Option<RectF> {
        let Some(screen) = node.parent else {
            return None;
        };
        let mut frame = node.frame;
        if header_hidden(screen, tree) {
            frame.y -= HEADER_HEIGHT;
            frame.h += HEADER_HEIGHT;
        } else {
            frame.y += HEADER_HEIGHT;
            frame.h = (frame.h - HEADER_HEIGHT).max(0.0);
        }
        Some(frame)
    }
}

/// Whether a screen's header config is hidden, whether or not it exists.
fn header_hidden(screen: i32, tree: &TreeView) -> bool {
    tree.children(screen)
        .into_iter()
        .filter_map(|tag| tree.node(tag))
        .find(|node| node.component == HEADER_CONFIG)
        .is_some_and(|config| props::header_hidden(&config))
}

/// The gap a modal sheet leaves around itself, and the size it is capped at.
const SHEET_MARGIN: f32 = 48.0;
const SHEET_MAX_WIDTH: f32 = 760.0;
const SHEET_MAX_HEIGHT: f32 = 640.0;

/// A modal presentation. It paints like a screen; the difference is that the
/// card underneath stays visible.
pub struct ModalScreenRenderer;

impl ComponentRenderer for ModalScreenRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    /// Paints the backdrop and the centred sheet the card sits in.
    ///
    /// A modal does not fill the window: it is a smaller card centred over the
    /// screen underneath, dimmed by a backdrop unless the presentation is
    /// transparent. Core keeps the node, its accessibility and its children, so
    /// this only wraps them.
    fn children(
        &self,
        node: &ComponentNode,
        children: Vec<AnyElement>,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Vec<AnyElement> {
        let material = props::is_transparent_presentation(node);
        let mut layers = Vec::with_capacity(2);
        if !material {
            layers.push(
                div()
                    .absolute()
                    .inset_0()
                    .size_full()
                    .bg(argb(0x80000000))
                    .into_any_element(),
            );
        }
        let width = (node.frame.w - SHEET_MARGIN).clamp(0.0, SHEET_MAX_WIDTH);
        let height = (node.frame.h - SHEET_MARGIN).clamp(0.0, SHEET_MAX_HEIGHT);
        let sheet = div()
            .absolute()
            .left(gpui::px(((node.frame.w - width) * 0.5).max(0.0)))
            .top(gpui::px(((node.frame.h - height) * 0.5).max(0.0)))
            .w(gpui::px(width))
            .h(gpui::px(height))
            .overflow_hidden()
            .bg(argb(if material { 0x00000000 } else { 0xff171923 }))
            .children(children);
        layers.push(sheet.into_any_element());
        layers
    }
}

/// A full-window overlay paints over the whole window, not inside the tree.
pub struct FullWindowOverlayRenderer;

impl ComponentRenderer for FullWindowOverlayRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn portal(&self, _props: &serde_json::Value) -> Option<Portal> {
        Some(Portal {
            visible: true,
            close_request_event: None,
        })
    }
}

/// Every component name this module paints, and how to build its renderer.
pub const RENDERED_COMPONENTS: &[(&str, fn() -> Box<dyn ComponentRenderer>)] = &[
    (STACK, || Box::new(StackRenderer)),
    (SCREEN, || Box::new(ScreenRenderer)),
    (MODAL_SCREEN, || Box::new(ModalScreenRenderer)),
    (HEADER_CONFIG, || Box::new(HeaderConfigRenderer)),
    (HEADER_SUBVIEW, || Box::new(HeaderSubviewRenderer)),
    (CONTENT_WRAPPER, || Box::new(ContentWrapperRenderer)),
    (FULL_WINDOW_OVERLAY, || Box::new(FullWindowOverlayRenderer)),
];
