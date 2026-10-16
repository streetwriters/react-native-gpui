//! The built-in `Modal` component.
//!
//! `ModalHostView` is a portal: core splices it out of its React Native parent
//! and paints it over the window, which the renderer declares through
//! `ComponentRenderer::portal`. Its appearance is entirely React Native's:
//! `Modal.js` supplies the backdrop and the container styles, so this renderer
//! paints no content and only contributes the two things a portal needs — when
//! it is visible, and that Escape asks it to close.

use serde_json::Value;

use crate::extensions::{register_component_renderer, ComponentNode, ComponentRenderer, Portal};
use gpui::{AnyElement, App, Window};

/// Escape asks the modal to close, which React Native surfaces as
/// `onRequestClose`.
const CLOSE_REQUEST_EVENT: &str = "topRequestClose";

struct ModalRenderer;

impl ComponentRenderer for ModalRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn portal(&self, props: &Value) -> Option<Portal> {
        Some(Portal {
            visible: props
                .get("visible")
                .and_then(Value::as_bool)
                .unwrap_or(true),
            close_request_event: Some(CLOSE_REQUEST_EVENT.to_string()),
        })
    }
}

/// Registers the built-in renderer.
pub fn register() {
    register_component_renderer("ModalHostView", std::sync::Arc::new(ModalRenderer));
}
