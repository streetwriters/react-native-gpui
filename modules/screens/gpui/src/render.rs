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
use gpui::{div, prelude::*, AnyElement, App, SharedString, Window};
use react_native_gpui::extensions::{
    ComponentNode, ComponentRenderer, Decoration, Portal, TreeView,
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
        // A card that is leaving stays painted until its transition ends.
        if tree
            .transition(node.tag)
            .is_some_and(|state| state.progress < 1.0)
        {
            return false;
        }
        // A card under a modal sibling stays painted so the modal has something
        // to cover.
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
        // A nested stack's inner navigator does not own Escape; the outer one
        // does, so one Escape pops one route.
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
        // The stack asks React to pop; the navigator decides, the same way a
        // native back gesture does.
        handle.dispatch_event(top, "topRequestClose", &serde_json::json!({}), _cx);
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
        // A hidden header takes no space; a visible one is the bar's height,
        // whatever Yoga computed for the Fabric node.
        let mut frame = node.frame;
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
        // `content` runs after this and is given no tree, so the two facts it
        // needs are recorded here, where the tree is available.
        let top = is_top_header(node, tree);
        let shown = should_show_back(node, tree);
        crate::state::set_header_facts(node.tag, top, shown);
        if props::header_hidden(node) || !top {
            return Decoration {
                display: Some(false),
                ..Decoration::default()
            };
        }
        let background = props::header_background_color(node);
        Decoration {
            background: (background != 0).then_some(background),
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
            .text_size(gpui::px(18.0))
            .child(SharedString::from(props::header_title(node).to_string()));
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
                    .child("‹"),
            );
        }
        Some(bar.into_any_element())
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
    screens.last().copied() == Some(parent)
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
            .children(config)
            .into_iter()
            .filter_map(|tag| tree.node(tag))
            .filter(|sibling| sibling.component == HEADER_SUBVIEW)
            .fold(0.0f32, |height, sibling| height.max(sibling.frame.h));
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
        if header_hidden(screen, tree) {
            return None;
        }
        let mut frame = node.frame;
        frame.y += HEADER_HEIGHT;
        frame.h = (frame.h - HEADER_HEIGHT).max(0.0);
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
