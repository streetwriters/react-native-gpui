//! The public extension API a module registers against.
//!
//! A module registers a renderer for a component name, or an observer of the
//! mounted tree. Core consults the registries and falls through to its own
//! behaviour when nothing is registered, so an uninstalled module changes
//! nothing.

use gpui::{AnyElement, App, Window};
use rn_gpui_sys::ffi::RectF;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// A read-only view of one mounted component.
///
/// Core builds it for the renderer and the observer; a module reads it and
/// never keeps it, because the tree it describes is replaced on the next mount.
#[derive(Clone, Debug)]
pub struct ComponentNode {
    pub component: String,
    pub tag: i32,
    pub frame: RectF,
    /// The JSON a module filled through `registerComponentProps`, parsed once.
    /// `Value::Null` when nothing filled it.
    pub props: Value,
    pub children: Vec<ComponentNode>,
}

impl ComponentNode {
    /// The first child with this test id, depth first.
    pub fn find_test_id(&self, test_id: &str) -> Option<&ComponentNode> {
        if self.props.get("testID").and_then(Value::as_str) == Some(test_id) {
            return Some(self);
        }
        self.children
            .iter()
            .find_map(|child| child.find_test_id(test_id))
    }
}

/// Paints one component name. Core calls it before its own View painting.
///
/// `node` is the component and its subtree; the returned element is placed in
/// the node's frame. Returning `None` falls through to core.
pub trait ComponentRenderer: 'static {
    fn render(&self, node: &ComponentNode, window: &mut Window, cx: &mut App)
        -> Option<AnyElement>;
}

/// Watches the mounted tree. Used for navigation, overlays and anything that
/// has to react to a component appearing, changing or going away.
pub trait StoreObserver: 'static {
    /// A component was created or inserted.
    fn on_mount(&self, node: &ComponentNode, cx: &mut App);
    /// A component's props or frame changed. `previous` is the node as it was.
    fn on_update(&self, node: &ComponentNode, previous: &ComponentNode, cx: &mut App);
    /// A component was deleted.
    fn on_remove(&self, tag: i32, cx: &mut App);
}

#[derive(Clone, Default)]
struct ComponentRenderers(Arc<Mutex<HashMap<String, Arc<dyn ComponentRenderer>>>>);

impl gpui::Global for ComponentRenderers {}

#[derive(Clone, Default)]
struct StoreObservers(Arc<Mutex<Vec<Arc<dyn StoreObserver>>>>);

impl gpui::Global for StoreObservers {}

/// Registers `renderer` for `component_name`, replacing any earlier one.
pub fn register_component_renderer(
    cx: &mut App,
    component_name: impl Into<String>,
    renderer: Arc<dyn ComponentRenderer>,
) {
    let registry = if let Some(registry) = cx.try_global::<ComponentRenderers>() {
        registry.0.clone()
    } else {
        let registry = ComponentRenderers::default();
        cx.set_global(registry.clone());
        registry.0.clone()
    };
    registry
        .lock()
        .expect("component renderer registry poisoned")
        .insert(component_name.into(), renderer);
}

/// Registers `observer`; observers are notified in registration order.
pub fn register_store_observer(cx: &mut App, observer: Arc<dyn StoreObserver>) {
    let registry = if let Some(registry) = cx.try_global::<StoreObservers>() {
        registry.0.clone()
    } else {
        let registry = StoreObservers::default();
        cx.set_global(registry.clone());
        registry.0.clone()
    };
    registry
        .lock()
        .expect("store observer registry poisoned")
        .push(observer);
}

/// The renderer registered for `component_name`, if any.
pub fn component_renderer(cx: &App, component_name: &str) -> Option<Arc<dyn ComponentRenderer>> {
    cx.try_global::<ComponentRenderers>().and_then(|registry| {
        registry
            .0
            .lock()
            .expect("component renderer registry poisoned")
            .get(component_name)
            .cloned()
    })
}

/// Every registered observer, for one notification pass.
pub fn store_observers(cx: &App) -> Vec<Arc<dyn StoreObserver>> {
    cx.try_global::<StoreObservers>()
        .map(|registry| {
            registry
                .0
                .lock()
                .expect("store observer registry poisoned")
                .clone()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::{div, prelude::*, px, TestAppContext};
    use serde_json::json;

    struct FakeRenderer {
        calls: Arc<Mutex<Vec<String>>>,
    }

    impl ComponentRenderer for FakeRenderer {
        fn render(
            &self,
            node: &ComponentNode,
            _window: &mut Window,
            _cx: &mut App,
        ) -> Option<AnyElement> {
            self.calls.lock().unwrap().push(node.component.clone());
            Some(div().into_any_element())
        }
    }

    struct FakeObserver {
        seen: Arc<Mutex<Vec<String>>>,
    }

    impl StoreObserver for FakeObserver {
        fn on_mount(&self, node: &ComponentNode, _cx: &mut App) {
            self.seen
                .lock()
                .unwrap()
                .push(format!("mount:{}", node.tag));
        }

        fn on_update(&self, node: &ComponentNode, _previous: &ComponentNode, _cx: &mut App) {
            self.seen
                .lock()
                .unwrap()
                .push(format!("update:{}", node.tag));
        }

        fn on_remove(&self, tag: i32, _cx: &mut App) {
            self.seen.lock().unwrap().push(format!("remove:{tag}"));
        }
    }

    fn node(component: &str, tag: i32) -> ComponentNode {
        ComponentNode {
            component: component.to_string(),
            tag,
            frame: RectF::default(),
            props: json!({ "testID": format!("id-{tag}") }),
            children: Vec::new(),
        }
    }

    #[gpui::test]
    fn a_registered_renderer_is_used_for_its_component_name(cx: &mut TestAppContext) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        cx.update(|cx| {
            register_component_renderer(
                cx,
                "RNSVGSvgView",
                Arc::new(FakeRenderer {
                    calls: calls.clone(),
                }),
            );
        });
        let found = cx.update(|cx| component_renderer(cx, "RNSVGSvgView"));
        assert!(found.is_some());
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), |_, _| gpui::Empty);
        window
            .update(cx, |_, window, cx| {
                let _ = found.unwrap().render(&node("RNSVGSvgView", 1), window, cx);
            })
            .unwrap();
        assert_eq!(*calls.lock().unwrap(), vec!["RNSVGSvgView".to_string()]);
    }

    #[gpui::test]
    fn an_unregistered_name_falls_through_to_core(cx: &mut TestAppContext) {
        assert!(cx.update(|cx| component_renderer(cx, "View")).is_none());
    }

    #[gpui::test]
    fn an_observer_sees_mount_update_and_remove_in_order(cx: &mut TestAppContext) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        cx.update(|cx| {
            register_store_observer(cx, Arc::new(FakeObserver { seen: seen.clone() }));
        });
        let observers = cx.update(|cx| store_observers(cx));
        assert_eq!(observers.len(), 1);
        cx.update(|cx| {
            observers[0].on_mount(&node("View", 7), cx);
            observers[0].on_update(&node("View", 7), &node("View", 7), cx);
            observers[0].on_remove(7, cx);
        });
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                "mount:7".to_string(),
                "update:7".to_string(),
                "remove:7".to_string()
            ]
        );
    }
}
