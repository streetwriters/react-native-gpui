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

/// A component painted over the window instead of inside the React Native tree.
///
/// A modal and a full-window overlay both need this, which is why it is one
/// concept rather than a per-component hook.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Portal {
    /// Whether it is on screen right now. A hidden portal keeps its node, so a
    /// modal that becomes invisible does not lose its subtree, but paints
    /// nothing and leaves the accessibility tree.
    pub visible: bool,
    /// The event a close request (Escape, or the platform's close gesture)
    /// dispatches to the portal's tag, which React Native surfaces as
    /// `onRequestClose`.
    pub close_request_event: Option<String>,
}

/// A component whose content scrolls inside its own frame.
///
/// Core owns the scrolling itself — a GPUI scroll handle, the wheel listener and
/// the resolved-offset read-back are platform capability, the same as a portal's
/// placement — so a component only declares that it scrolls, and how.
#[derive(Clone, Debug, PartialEq)]
pub struct ScrollSpec {
    /// The content's size, which may exceed the frame.
    pub content_size: (f32, f32),
    /// The axis: horizontal scrolls x, otherwise y.
    pub horizontal: bool,
    /// Whether the user may scroll it. A disabled scroll view clips instead.
    pub enabled: bool,
    /// Whether to paint a scroll indicator.
    pub indicator: bool,
    /// The offset React Native currently believes, applied before painting.
    pub offset: (f32, f32),
    /// The event dispatched as the offset changes, `topScroll` in React Native.
    pub event: Option<String>,
}

/// Paints one component name.
///
/// Core tries `content` first and then `render`. A component whose painting is
/// its whole appearance implements `render`; one that core still has to give a
/// box, a background, a border and an accessibility role implements `content`,
/// which core places inside the element it builds.
pub trait ComponentRenderer: Send + Sync + 'static {
    /// The node's own content, inserted where core puts a component's children.
    /// The surrounding element keeps core's style and accessibility.
    fn content(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    /// The node's whole appearance, replacing the element core would build.
    /// Returning `None` falls through to `content` and then to core.
    fn render(&self, node: &ComponentNode, window: &mut Window, cx: &mut App)
        -> Option<AnyElement>;

    /// Whether this component is painted over the window, and how it closes.
    ///
    /// `None` leaves the component in the tree. It reads parsed props rather
    /// than a `ComponentNode` because the store decides placement while it walks
    /// a mount batch, before any node exists.
    fn portal(&self, _props: &Value) -> Option<Portal> {
        None
    }

    /// Whether this component scrolls its content, and with what geometry.
    ///
    /// Like `portal`, it reads parsed props so the answer does not depend on a
    /// render pass.
    fn scroll(&self, _props: &Value) -> Option<ScrollSpec> {
        None
    }
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

/// The portal a component's renderer declares for these props.
///
/// The store calls it to decide whether a component is spliced out of its
/// React Native parent. A component with no renderer, or one whose renderer
/// does not declare a portal, stays in the tree.
pub fn component_portal(component_name: &str, props: &Value) -> Option<Portal> {
    component_renderer(component_name)?.portal(props)
}

/// The scroll declaration a component's renderer makes for these props.
pub fn component_scroll(component_name: &str, props: &Value) -> Option<ScrollSpec> {
    component_renderer(component_name)?.scroll(props)
}

/// Parses the JSON a module filled for a component, or `Null`.
pub fn parse_extension_props(json: &str) -> Value {
    if json.is_empty() {
        Value::Null
    } else {
        serde_json::from_str(json).unwrap_or(Value::Null)
    }
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
            "FixtureWidget",
            Arc::new(FakeRenderer {
                calls: calls.clone(),
            }),
        );
        let found = component_renderer("FixtureWidget").expect("registered renderer");
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), |_, _| gpui::Empty);
        window
            .update(cx, |_, window, cx| {
                assert!(found
                    .render(&node("FixtureWidget", 1), window, cx)
                    .is_some());
            })
            .unwrap();
        assert_eq!(*calls.lock().unwrap(), vec!["FixtureWidget".to_string()]);
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
