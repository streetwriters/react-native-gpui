//! The public extension API a module registers against.
//!
//! A module registers a renderer for a component name, or an observer of the
//! mounted tree. Core consults the registries and falls through to its own
//! behaviour when nothing is registered, so an uninstalled module changes
//! nothing.
//!
//! Registration happens in the module's `rn_gpui_register()`, which autolink
//! calls from `ensure_linked()` while `main` starts — before any `gpui::App`
//! exists. The registries are therefore process-wide, like
//! `rn_gpui_module::register`.

use gpui::{AnyElement, App, Window};
use rn_gpui_sys::ffi::RectF;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

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
    /// The first component in this subtree with this test id.
    pub fn find_test_id(&self, test_id: &str) -> Option<&ComponentNode> {
        if self.props.get("testID").and_then(Value::as_str) == Some(test_id) {
            return Some(self);
        }
        self.children
            .iter()
            .find_map(|child| child.find_test_id(test_id))
    }
}

/// A transition a module asks core to run on a component.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransitionKind {
    SlideFromRight,
    SlideFromLeft,
    Fade,
}

#[derive(Clone, Copy, Debug)]
pub struct Transition {
    pub kind: TransitionKind,
    pub duration_ms: u64,
    /// How far the component travels, as a fraction of its width.
    pub distance_factor: f32,
}

/// What a `StoreObserver` may ask core to do, beyond reading the tree.
///
/// It exposes exactly what the screens module's store code does today.
pub struct StoreHandle {
    store: gpui::Entity<crate::store::ViewStore>,
}

impl StoreHandle {
    pub(crate) fn new(store: gpui::Entity<crate::store::ViewStore>) -> Self {
        Self { store }
    }

    /// Hides or shows a component, and its header/content wrappers.
    pub fn set_hidden(&self, tag: i32, hidden: bool, cx: &mut App) {
        crate::store::set_component_hidden(&self.store, tag, hidden, cx);
    }

    /// Runs `transition` on a component.
    pub fn start_transition(&self, tag: i32, transition: Transition, cx: &mut App) {
        crate::store::start_component_transition(&self.store, tag, transition, cx);
    }

    /// Emits `name` to JS for `tag`. An empty payload sends `{}`.
    pub fn dispatch_event(&self, tag: i32, name: &str, payload: &Value, cx: &mut App) {
        let payload = if payload.is_null() {
            &Value::Object(serde_json::Map::new())
        } else {
            payload
        };
        self.store.read(cx).host.dispatch_event(tag, name, payload);
    }
}

/// Paints one component name. Core calls it before its own View painting.
///
/// `node` is the component and its subtree; the returned element is placed in
/// the node's frame. Returning `None` falls through to core.
pub trait ComponentRenderer: Send + Sync + 'static {
    fn render(&self, node: &ComponentNode, window: &mut Window, cx: &mut App)
        -> Option<AnyElement>;
}

/// Watches the mounted tree. Used for navigation, overlays and anything that
/// has to react to a component appearing, changing or going away.
pub trait StoreObserver: Send + Sync + 'static {
    /// A component was created or inserted.
    fn on_mount(&self, node: &ComponentNode, handle: &StoreHandle, cx: &mut App);
    /// A component's props or frame changed. `previous` is the node as it was.
    fn on_update(
        &self,
        node: &ComponentNode,
        previous: &ComponentNode,
        handle: &StoreHandle,
        cx: &mut App,
    );
    /// A component was deleted.
    fn on_remove(&self, tag: i32, handle: &StoreHandle, cx: &mut App);
}

fn component_renderers() -> &'static Mutex<HashMap<String, Arc<dyn ComponentRenderer>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<dyn ComponentRenderer>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn store_observers_registry() -> &'static Mutex<Vec<Arc<dyn StoreObserver>>> {
    static REGISTRY: OnceLock<Mutex<Vec<Arc<dyn StoreObserver>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(Vec::new()))
}

/// Registers `renderer` for `component_name`, replacing any earlier one.
///
/// Called from a module's `rn_gpui_register()`, before the runtime starts.
pub fn register_component_renderer(
    component_name: impl Into<String>,
    renderer: Arc<dyn ComponentRenderer>,
) {
    component_renderers()
        .lock()
        .expect("component renderer registry poisoned")
        .insert(component_name.into(), renderer);
}

/// Registers `observer`; observers are notified in registration order.
///
/// Called from a module's `rn_gpui_register()`, before the runtime starts.
pub fn register_store_observer(observer: Arc<dyn StoreObserver>) {
    store_observers_registry()
        .lock()
        .expect("store observer registry poisoned")
        .push(observer);
}

/// The renderer registered for `component_name`, if any.
pub fn component_renderer(component_name: &str) -> Option<Arc<dyn ComponentRenderer>> {
    component_renderers()
        .lock()
        .expect("component renderer registry poisoned")
        .get(component_name)
        .cloned()
}

/// Every registered observer, for one notification pass.
pub fn store_observers() -> Vec<Arc<dyn StoreObserver>> {
    store_observers_registry()
        .lock()
        .expect("store observer registry poisoned")
        .clone()
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
        fn on_mount(&self, node: &ComponentNode, _handle: &StoreHandle, _cx: &mut App) {
            self.seen
                .lock()
                .unwrap()
                .push(format!("mount:{}", node.tag));
        }

        fn on_update(
            &self,
            node: &ComponentNode,
            _previous: &ComponentNode,
            _handle: &StoreHandle,
            _cx: &mut App,
        ) {
            self.seen
                .lock()
                .unwrap()
                .push(format!("update:{}", node.tag));
        }

        fn on_remove(&self, tag: i32, _handle: &StoreHandle, _cx: &mut App) {
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
        register_component_renderer(
            "RNSVGSvgView",
            Arc::new(FakeRenderer {
                calls: calls.clone(),
            }),
        );
        let found = component_renderer("RNSVGSvgView").expect("registered renderer");
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), |_, _| gpui::Empty);
        window
            .update(cx, |_, window, cx| {
                assert!(found.render(&node("RNSVGSvgView", 1), window, cx).is_some());
            })
            .unwrap();
        assert_eq!(*calls.lock().unwrap(), vec!["RNSVGSvgView".to_string()]);
    }

    #[gpui::test]
    fn an_unregistered_name_falls_through_to_core(_cx: &mut TestAppContext) {
        assert!(component_renderer("View").is_none());
    }

    #[gpui::test]
    fn an_observer_sees_mount_update_and_remove_in_order(cx: &mut TestAppContext) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        register_store_observer(Arc::new(FakeObserver { seen: seen.clone() }));
        let observers = store_observers();
        assert!(!observers.is_empty());
        let handle = crate::store::test_store_handle(cx);
        cx.update(|cx| {
            let observer = observers.last().unwrap().clone();
            observer.on_mount(&node("View", 7), &handle, cx);
            observer.on_update(&node("View", 7), &node("View", 7), &handle, cx);
            observer.on_remove(7, &handle, cx);
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
