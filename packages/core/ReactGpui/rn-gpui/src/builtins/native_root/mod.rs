//! The native root: a box whose content is a native tree.
//!
//! A second React reconciler describes nested components of one family as
//! batches of operations, and [`crate::native_tree`] keeps them as instances. This
//! component is where such a tree meets React Native's layout: Yoga sizes the box
//! like any view, and the tree is built inside it as one GPUI element tree.
//!
//! The batches arrive from JavaScript through `__gpuiNativeRootApply(rootId,
//! json)` and are applied on the main thread. Events go back as `topNativeEvent`
//! on the box, naming the instance and the prop that holds its handler.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use gpui::{div, prelude::*, AnyElement, App, Window};
use serde_json::{json, Map, Value};

use crate::extensions::{register_component_renderer, ComponentNode, ComponentRenderer};
use crate::host::Host;
use crate::native_tree::{
    register_native_component, NativeComponent, NativeContext, NativeOp, NativeTree,
};

pub const COMPONENT: &str = "DesktopNativeRoot";

/// The type of the instance that holds a tree's top-level components.
pub const CONTAINER: &str = "NativeRootContainer";

struct RootState {
    tree: NativeTree,
    /// The tag of the node that shows this tree, once it has rendered.
    tag: Rc<Cell<Option<i32>>>,
}

thread_local! {
    static TREES: RefCell<HashMap<u32, RootState>> = RefCell::new(HashMap::new());
}

fn root_id(node: &ComponentNode) -> u32 {
    node.props
        .get("rootId")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32
}

/// Applies a batch of operations to the tree `root`, making the tree if this is
/// its first, and repaints the node that shows it. `"destroy"` drops the tree.
pub(crate) fn apply_ops(cx: &mut App, root: u32, payload: &str) {
    if payload == "destroy" {
        TREES.with(|trees| {
            trees.borrow_mut().remove(&root);
        });
        return;
    }
    let ops = match serde_json::from_str::<Value>(payload)
        .map_err(|error| error.to_string())
        .and_then(|batch| NativeOp::parse_batch(&batch))
    {
        Ok(ops) => ops,
        Err(error) => {
            log::error!("[native-root] bad batch for tree {root}: {error}");
            return;
        }
    };
    let Some(store) = crate::store::store_from(cx) else {
        return;
    };
    let host: Host = store.read(cx).host.clone();
    drop_stale_trees(cx, root);
    let tag = TREES.with(|trees| {
        let mut trees = trees.borrow_mut();
        let state = trees.entry(root).or_insert_with(|| {
            let tag = Rc::new(Cell::new(None));
            let sink_tag = tag.clone();
            RootState {
                tree: NativeTree::new(move |event| {
                    if let Some(tag) = sink_tag.get() {
                        host.dispatch_event(
                            tag,
                            "topNativeEvent",
                            &json!({
                                "id": event.id,
                                "name": event.name,
                                "payload": event.payload,
                            }),
                        );
                    }
                }),
                tag,
            }
        });
        let started = std::time::Instant::now();
        let count = ops.len() as u64;
        state.tree.apply(ops, cx);
        crate::counters::add(crate::counters::Counter::NativeOpsApplied, count);
        crate::counters::add(
            crate::counters::Counter::NativeApplyMicros,
            started.elapsed().as_micros() as u64,
        );
        state.tag.get()
    });
    if let Some(node) = tag.and_then(|tag| store.read(cx).nodes.get(&tag).cloned()) {
        node.update(cx, |_, cx| cx.notify());
    }
}

/// Drops the trees whose node is gone, which is what a reload or an unmount that
/// never sent `destroy` leaves behind. `keep` is the tree being applied to.
fn drop_stale_trees(cx: &App, keep: u32) {
    let Some(store) = crate::store::store_from(cx) else {
        return;
    };
    let store = store.read(cx);
    TREES.with(|trees| {
        trees.borrow_mut().retain(|root, state| {
            *root == keep
                || state
                    .tag
                    .get()
                    .is_none_or(|tag| store.nodes.contains_key(&tag))
        });
    });
}

struct NativeRootRenderer;

impl ComponentRenderer for NativeRootRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }

    fn content(
        &self,
        node: &ComponentNode,
        window: &mut Window,
        cx: &mut App,
    ) -> Option<AnyElement> {
        let root = root_id(node);
        TREES.with(|trees| {
            let mut trees = trees.borrow_mut();
            let state = trees.get_mut(&root)?;
            state.tag.set(Some(node.tag));
            let started = std::time::Instant::now();
            let ids: Vec<_> = state.tree.roots().to_vec();
            let elements: Vec<AnyElement> = ids
                .into_iter()
                .map(|id| state.tree.render(id, window, cx))
                .collect();
            crate::counters::add(
                crate::counters::Counter::NativeRenderMicros,
                started.elapsed().as_micros() as u64,
            );
            Some(
                div()
                    .absolute()
                    .size_full()
                    .flex()
                    .flex_col()
                    .children(elements)
                    .into_any_element(),
            )
        })
    }
}

/// The instance every tree hangs from: a box that lays its children out in a
/// column, or in a row when its `direction` prop says so.
struct Container;

impl NativeComponent for Container {
    fn create(_props: &Map<String, Value>, _cx: &mut NativeContext) -> Self {
        Container
    }

    fn update(
        &mut self,
        _props: &Map<String, Value>,
        _changed: &[String],
        _cx: &mut NativeContext,
    ) {
    }

    fn render(
        &mut self,
        props: &Map<String, Value>,
        children: Vec<AnyElement>,
        _window: &mut Window,
        _cx: &mut App,
    ) -> AnyElement {
        let row = props.get("direction").and_then(Value::as_str) == Some("row");
        let element = div().size_full().flex();
        if row {
            element.flex_row()
        } else {
            element.flex_col()
        }
        .children(children)
        .into_any_element()
    }
}

pub fn register() {
    register_native_component::<Container>(CONTAINER);
    register_component_renderer(COMPONENT, Arc::new(NativeRootRenderer));
}

/// What the test driver and the accessibility checks see of one instance.
pub(crate) struct InstanceInfo {
    pub tag: i32,
    pub type_name: String,
    pub props: Map<String, Value>,
    /// In window coordinates, once the instance has painted.
    pub bounds: Option<gpui::Bounds<gpui::Pixels>>,
    pub children: Vec<i32>,
    pub root: u32,
}

thread_local! {
    static SYNTHETIC: RefCell<Synthetic> = RefCell::new(Synthetic::default());
}

/// The tags the test driver gives instances. Fabric's are positive; these are
/// negative, so one number says which kind it is and which instance.
#[derive(Default)]
struct Synthetic {
    by_instance: HashMap<(u32, u64), i32>,
    by_tag: HashMap<i32, (u32, u64)>,
    last: i32,
}

fn synthetic_tag(root: u32, id: u64) -> i32 {
    SYNTHETIC.with(|synthetic| {
        let mut synthetic = synthetic.borrow_mut();
        if let Some(tag) = synthetic.by_instance.get(&(root, id)) {
            return *tag;
        }
        synthetic.last -= 1;
        let tag = synthetic.last;
        synthetic.by_instance.insert((root, id), tag);
        synthetic.by_tag.insert(tag, (root, id));
        tag
    })
}

/// Every instance of the tree `root`, parents first.
pub(crate) fn instances(root: u32) -> Vec<InstanceInfo> {
    TREES.with(|trees| {
        let trees = trees.borrow();
        let Some(state) = trees.get(&root) else {
            return Vec::new();
        };
        state
            .tree
            .ids()
            .into_iter()
            .map(|id| InstanceInfo {
                tag: synthetic_tag(root, id),
                type_name: state.tree.type_of(id).unwrap_or_default().to_string(),
                props: state.tree.props_of(id).cloned().unwrap_or_default(),
                bounds: state.tree.bounds_of(id),
                children: state
                    .tree
                    .children(id)
                    .iter()
                    .map(|child| synthetic_tag(root, *child))
                    .collect(),
                root,
            })
            .collect()
    })
}

/// Every tree that has a node showing it.
pub(crate) fn root_ids() -> Vec<u32> {
    TREES.with(|trees| trees.borrow().keys().copied().collect())
}

/// Where a click on the instance with this tag goes: its centre in window
/// coordinates, and the tag of the node that shows its tree, which is what the
/// pointer is over as far as React Native's hit testing goes.
pub(crate) fn pointer_target(tag: i32) -> Option<(gpui::Point<gpui::Pixels>, i32)> {
    let (root, id) = SYNTHETIC.with(|synthetic| synthetic.borrow().by_tag.get(&tag).copied())?;
    TREES.with(|trees| {
        let trees = trees.borrow();
        let state = trees.get(&root)?;
        let bounds = state.tree.bounds_of(id)?;
        Some((bounds.center(), state.tag.get()?))
    })
}
