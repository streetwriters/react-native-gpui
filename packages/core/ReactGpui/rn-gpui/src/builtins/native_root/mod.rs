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
