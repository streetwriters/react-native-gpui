use gpui::{AnyElement, App, Window};
use rn_gpui_sys::ffi::RectF;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct ComponentNode {
    pub component: String,
    pub tag: i32,
    pub frame: RectF,
    pub props: Arc<Value>,
    pub parent: Option<i32>,
    pub children: Vec<ComponentNode>,
}

impl ComponentNode {
    pub fn find_test_id(&self, test_id: &str) -> Option<&ComponentNode> {
        if self.props.get("testID").and_then(Value::as_str) == Some(test_id) {
            return Some(self);
        }
        self.children
            .iter()
            .find_map(|child| child.find_test_id(test_id))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pose {
    pub offset_x: f32,
    pub opacity: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Transition {
    pub from: Pose,
    pub to: Pose,
    pub duration: Duration,
}

impl Transition {
    pub fn pose_at(&self, progress: f32) -> Pose {
        let progress = progress.clamp(0.0, 1.0);
        Pose {
            offset_x: self.from.offset_x + (self.to.offset_x - self.from.offset_x) * progress,
            opacity: self.from.opacity + (self.to.opacity - self.from.opacity) * progress,
        }
    }

    pub fn progress_now(&self, started_at: Instant) -> f32 {
        let duration = self.duration.as_secs_f32().max(f32::EPSILON);
        let linear = ((Instant::now() - started_at).as_secs_f32() / duration).clamp(0.0, 1.0);
        linear * linear * (3.0 - 2.0 * linear)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct TransitionState {
    pub transition: Transition,
    pub started_at: Instant,
    pub progress: f32,
}

#[derive(Clone)]
pub struct StoreHandle {
    store: gpui::WeakEntity<crate::store::ViewStore>,
    queued: Option<Arc<Mutex<Vec<Command>>>>,
}

pub enum Command {
    Transition {
        tag: i32,
        transition: Transition,
    },
    ClearTransition {
        tag: i32,
    },
    Dispatch {
        tag: i32,
        name: String,
        payload: Value,
    },
    Wake,
}

impl StoreHandle {
    pub(crate) fn new(store: gpui::WeakEntity<crate::store::ViewStore>) -> Self {
        Self {
            store,
            queued: None,
        }
    }

    pub(crate) fn queued(
        store: gpui::WeakEntity<crate::store::ViewStore>,
        queued: Arc<Mutex<Vec<Command>>>,
    ) -> Self {
        Self {
            store,
            queued: Some(queued),
        }
    }

    pub(crate) fn is_queued(&self) -> bool {
        self.queued.is_some()
    }

    fn record(&self, command: Command) -> bool {
        match &self.queued {
            Some(queued) => {
                queued.lock().expect("command queue poisoned").push(command);
                true
            }
            None => false,
        }
    }

    pub fn dispatch_event(&self, tag: i32, name: &str, payload: &Value, cx: &mut App) {
        if self.record(Command::Dispatch {
            tag,
            name: name.to_string(),
            payload: payload.clone(),
        }) {
            return;
        }
        let Some(store) = self.store.upgrade() else {
            return;
        };
        store.read(cx).host.dispatch_event(tag, name, payload);
    }

    pub fn wake(&self, cx: &mut App) {
        if self.record(Command::Wake) {
            return;
        }
        let Some(store) = self.store.upgrade() else {
            return;
        };
        store.read(cx).host.on_render();
    }

    pub fn set_hidden(&self, tag: i32, hidden: bool, cx: &mut App) {
        if let Some(store) = self.store.upgrade() {
            crate::store::set_component_hidden(&store, tag, hidden, cx);
        }
    }

    pub fn start_transition(&self, tag: i32, transition: Transition, cx: &mut App) {
        if self.record(Command::Transition { tag, transition }) {
            return;
        }
        if let Some(store) = self.store.upgrade() {
            crate::store::start_component_transition(&store, tag, transition, cx);
        }
    }

    pub fn clear_transition(&self, tag: i32, cx: &mut App) {
        if self.record(Command::ClearTransition { tag }) {
            return;
        }
        if let Some(store) = self.store.upgrade() {
            crate::store::clear_node_transition(&store, tag, cx);
        }
    }

    pub fn request_frame(&self, window: &mut Window) {
        let _ = window;
    }

    pub fn retain_subtree(&self, tag: i32) {
        if self.record(Command::Wake) {
            log::warn!("[extensions] retain_subtree is only valid in before_batch");
            return;
        }
        crate::store::request_retain_subtree(tag);
    }

    pub fn release_retained(&self, tag: i32, cx: &mut App) {
        if let Some(store) = self.store.upgrade() {
            crate::store::release_retained_subtree(&store, tag, cx);
        }
    }

    pub fn after(
        &self,
        duration: Duration,
        cx: &mut App,
        f: impl FnOnce(&StoreHandle, &mut App) + 'static,
    ) {
        let Some(store) = self.store.upgrade() else {
            return;
        };
        let handle = StoreHandle::new(self.store.clone());
        crate::store::after_on_store(store, duration, cx, move |cx| f(&handle, cx));
    }

    pub fn animations_enabled(&self, cx: &App) -> bool {
        let Some(store) = self.store.upgrade() else {
            return false;
        };
        store.read(cx).animations_enabled(cx)
    }

    pub fn with_tree(&self, cx: &App, f: impl FnOnce(&TreeView)) {
        let Some(store) = self.store.upgrade() else {
            return;
        };
        let store = store.read(cx);
        f(&store.tree_view(cx));
    }
}

pub struct TreeView<'a> {
    pub(crate) nodes: &'a HashMap<i32, gpui::Entity<crate::node_view::RNNodeView>>,
    pub(crate) root_tags: Vec<i32>,
    pub(crate) top_inset: f32,
    pub(crate) animations_enabled: bool,
    pub(crate) current: Option<(i32, &'a crate::node_view::RNNodeView)>,
    pub(crate) retained: &'a HashMap<i32, Vec<i32>>,
    pub(crate) app: *const App,
}

impl TreeView<'_> {
    fn app(&self) -> &App {
        unsafe { &*self.app }
    }

    pub fn node(&self, tag: i32) -> Option<ComponentNode> {
        if let Some((current_tag, node)) = self.current {
            if current_tag == tag {
                return Some(node.component_node_shallow());
            }
        }
        self.nodes
            .get(&tag)
            .map(|node| node.read(self.app()).component_node_shallow())
    }

    pub fn parent(&self, tag: i32) -> Option<i32> {
        self.node(tag).and_then(|node| node.parent)
    }

    pub fn children(&self, tag: i32) -> Vec<i32> {
        if let Some((current_tag, node)) = self.current {
            if current_tag == tag {
                return node.child_tags();
            }
        }
        self.nodes
            .get(&tag)
            .map(|node| node.read(self.app()).child_tags())
            .unwrap_or_default()
    }

    pub fn ancestors(&self, tag: i32) -> Vec<i32> {
        let mut out = Vec::new();
        let mut current = self.parent(tag);
        while let Some(parent) = current {
            out.push(parent);
            current = self.parent(parent);
        }
        out
    }

    pub fn is_live(&self, tag: i32) -> bool {
        self.nodes.contains_key(&tag)
    }

    pub fn is_root(&self, tag: i32) -> bool {
        self.root_tags.contains(&tag)
    }

    pub fn surface_of(&self, tag: i32) -> Option<i32> {
        self.nodes
            .get(&tag)
            .map(|node| node.read(self.app()).surface_id)
    }

    pub fn transition(&self, tag: i32) -> Option<TransitionState> {
        if let Some((current_tag, node)) = self.current {
            if current_tag == tag {
                return node.transition_state();
            }
        }
        self.nodes
            .get(&tag)
            .and_then(|node| node.read(self.app()).transition_state())
    }

    pub fn window_top_inset(&self) -> f32 {
        self.top_inset
    }

    pub fn animations_enabled(&self) -> bool {
        self.animations_enabled
    }

    pub fn retained_tags(&self) -> Vec<i32> {
        self.retained.keys().copied().collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BatchOpKind {
    Create,
    Delete,
    Insert,
    Remove,
    Update,
}

#[derive(Clone, Debug)]
pub struct BatchOp {
    pub kind: BatchOpKind,
    pub tag: i32,
    pub parent_tag: i32,
    pub index: i32,
    pub component: String,
    pub props: Arc<Value>,
    pub props_changed: bool,
}

#[derive(Clone, Debug, Default)]
pub struct BatchView {
    pub surface_id: i32,
    pub ops: Vec<BatchOp>,
}

impl BatchView {
    pub fn component_of<'a>(&'a self, tag: i32, tree: &TreeView) -> Option<String> {
        self.ops
            .iter()
            .find(|op| op.tag == tag && op.kind == BatchOpKind::Create)
            .map(|op| op.component.clone())
            .or_else(|| tree.node(tag).map(|node| node.component))
    }

    pub fn parent_of(&self, tag: i32) -> Option<i32> {
        self.ops
            .iter()
            .find(|op| op.tag == tag && op.kind == BatchOpKind::Insert)
            .map(|op| op.parent_tag)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Decoration {
    pub display: Option<bool>,
    pub background: Option<u32>,
    pub clip: bool,
    pub a11y_hidden: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Portal {
    pub visible: bool,
    pub close_request_event: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ScrollSpec {
    pub content_size: (f32, f32),
    pub horizontal: bool,
    pub enabled: bool,
    pub indicator: bool,
    pub offset: (f32, f32),
    pub event: Option<String>,
}

pub trait ComponentRenderer: Send + Sync + 'static {
    fn content(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn render(&self, node: &ComponentNode, window: &mut Window, cx: &mut App)
        -> Option<AnyElement>;

    fn portal(&self, _props: &Value) -> Option<Portal> {
        None
    }

    fn scroll(&self, _props: &Value) -> Option<ScrollSpec> {
        None
    }

    fn layout_frame(&self, _node: &ComponentNode, _tree: &TreeView) -> Option<RectF> {
        None
    }

    fn hides_subtree(&self, _node: &ComponentNode, _tree: &TreeView) -> bool {
        false
    }

    fn decorate(&self, _node: &ComponentNode, _tree: &TreeView) -> Decoration {
        Decoration::default()
    }

    fn children(
        &self,
        _node: &ComponentNode,
        children: Vec<AnyElement>,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Vec<AnyElement> {
        children
    }

    fn handles_keys(&self, _node: &ComponentNode) -> bool {
        false
    }

    fn on_key_down(
        &self,
        _node: &ComponentNode,
        _key: &str,
        _tree: &TreeView,
        _handle: &StoreHandle,
        _window: &mut Window,
        _cx: &mut App,
    ) -> bool {
        false
    }

    fn depends_on_window_insets(&self) -> bool {
        false
    }
}

pub trait StoreObserver: Send + Sync + 'static {
    fn on_mount(&self, node: &ComponentNode, handle: &StoreHandle, cx: &mut App);
    fn on_update(
        &self,
        node: &ComponentNode,
        previous: &ComponentNode,
        handle: &StoreHandle,
        cx: &mut App,
    );
    fn on_remove(&self, tag: i32, handle: &StoreHandle, cx: &mut App);

    fn before_batch(
        &self,
        _batch: &BatchView,
        _tree: &TreeView,
        _handle: &StoreHandle,
        _cx: &mut App,
    ) {
    }

    fn on_insert(
        &self,
        _child: &ComponentNode,
        _parent: i32,
        _previous_children: &[i32],
        _tree: &TreeView,
        _handle: &StoreHandle,
        _cx: &mut App,
    ) {
    }

    fn on_remove_child(
        &self,
        _child: i32,
        _parent: i32,
        _retained: bool,
        _tree: &TreeView,
        _handle: &StoreHandle,
        _cx: &mut App,
    ) {
    }

    fn after_batch(&self, _tree: &TreeView, _handle: &StoreHandle, _cx: &mut App) {}

    fn on_transition_frame(&self, _tag: i32, _progress: f32, _handle: &StoreHandle, _cx: &mut App) {
    }
}

fn component_renderers() -> &'static Mutex<HashMap<String, Arc<dyn ComponentRenderer>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<dyn ComponentRenderer>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn store_observers_registry() -> &'static Mutex<Vec<Arc<dyn StoreObserver>>> {
    static REGISTRY: OnceLock<Mutex<Vec<Arc<dyn StoreObserver>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn register_component_renderer(
    component_name: impl Into<String>,
    renderer: Arc<dyn ComponentRenderer>,
) {
    component_renderers()
        .lock()
        .expect("component renderer registry poisoned")
        .insert(component_name.into(), renderer);
}

pub fn register_store_observer(observer: Arc<dyn StoreObserver>) {
    store_observers_registry()
        .lock()
        .expect("store observer registry poisoned")
        .push(observer);
}

pub fn component_renderer(component_name: &str) -> Option<Arc<dyn ComponentRenderer>> {
    component_renderers()
        .lock()
        .expect("component renderer registry poisoned")
        .get(component_name)
        .cloned()
}

pub fn component_portal(component_name: &str, props: &Value) -> Option<Portal> {
    component_renderer(component_name)?.portal(props)
}

pub fn component_scroll(component_name: &str, props: &Value) -> Option<ScrollSpec> {
    component_renderer(component_name)?.scroll(props)
}

pub fn parse_extension_props(json: &str) -> Value {
    if json.is_empty() {
        Value::Null
    } else {
        serde_json::from_str(json).unwrap_or(Value::Null)
    }
}

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
            props: Arc::new(json!({ "testID": format!("id-{tag}") })),
            parent: None,
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

    #[gpui::test]
    fn batch_hooks_run_in_order(cx: &mut TestAppContext) {
        let order = Arc::new(Mutex::new(Vec::new()));
        let observer = Arc::new(OrderObserver {
            order: order.clone(),
        });
        let handle = crate::store::test_store_handle(cx);
        cx.update(|cx| {
            let tree = empty_tree();
            observer.before_batch(&BatchView::default(), &tree, &handle, cx);
            observer.on_insert(&node("View", 1), 0, &[], &tree, &handle, cx);
            observer.on_remove_child(1, 0, false, &tree, &handle, cx);
            observer.after_batch(&tree, &handle, cx);
        });
        assert_eq!(
            *order.lock().unwrap(),
            vec!["before", "insert", "remove_child", "after"]
        );
    }

    struct OrderObserver {
        order: Arc<Mutex<Vec<&'static str>>>,
    }

    impl StoreObserver for OrderObserver {
        fn on_mount(&self, _node: &ComponentNode, _handle: &StoreHandle, _cx: &mut App) {}
        fn on_update(
            &self,
            _node: &ComponentNode,
            _previous: &ComponentNode,
            _handle: &StoreHandle,
            _cx: &mut App,
        ) {
        }
        fn on_remove(&self, _tag: i32, _handle: &StoreHandle, _cx: &mut App) {}
        fn before_batch(
            &self,
            _batch: &BatchView,
            _tree: &TreeView,
            _handle: &StoreHandle,
            _cx: &mut App,
        ) {
            self.order.lock().unwrap().push("before");
        }
        fn on_insert(
            &self,
            _child: &ComponentNode,
            _parent: i32,
            _previous_children: &[i32],
            _tree: &TreeView,
            _handle: &StoreHandle,
            _cx: &mut App,
        ) {
            self.order.lock().unwrap().push("insert");
        }
        fn on_remove_child(
            &self,
            _child: i32,
            _parent: i32,
            _retained: bool,
            _tree: &TreeView,
            _handle: &StoreHandle,
            _cx: &mut App,
        ) {
            self.order.lock().unwrap().push("remove_child");
        }
        fn after_batch(&self, _tree: &TreeView, _handle: &StoreHandle, _cx: &mut App) {
            self.order.lock().unwrap().push("after");
        }
    }

    fn empty_tree() -> TreeView<'static> {
        static NODES: OnceLock<HashMap<i32, gpui::Entity<crate::node_view::RNNodeView>>> =
            OnceLock::new();
        static RETAINED: OnceLock<HashMap<i32, Vec<i32>>> = OnceLock::new();
        TreeView {
            nodes: NODES.get_or_init(HashMap::new),
            root_tags: Vec::new(),
            top_inset: 0.0,
            animations_enabled: true,
            current: None,
            retained: RETAINED.get_or_init(HashMap::new),
            app: std::ptr::null(),
        }
    }
}
