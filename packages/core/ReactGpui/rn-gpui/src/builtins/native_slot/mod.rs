//! A place in a native tree that shows React Native children.
//!
//! `<NativeSlot>` inside a native tree is two things. In the tree it is an
//! instance, the placeholder: a box as wide as the tree's layout makes it. Next
//! to the tree, in React Native's, it is a `DesktopNativeSlot` node that holds
//! the children. The placeholder embeds that node, so the node is painted,
//! clipped and hit where the placeholder is, as part of the tree's element
//! tree. Layout goes the other way: the placeholder reports its width to
//! JavaScript, which gives it to the node, and the node's height becomes the
//! placeholder's.
//!
//! Where React Native thinks the node is (`measure`, the test driver, the
//! accessibility tree) is corrected by `slot_shift`, a scroll link the placeholder
//! keeps current with where it was painted.

use std::cell::Cell;
use std::rc::Rc;
use std::sync::Arc;

use gpui::{canvas, div, point, prelude::*, px, AnyElement, App, Window};
use serde_json::{json, Map, Value};

use crate::extensions::{register_component_renderer, ComponentNode, ComponentRenderer};
use crate::native_tree::{
    register_native_component, NativeComponent, NativeContext, NativeEmitter,
};

pub const COMPONENT: &str = "DesktopNativeSlot";

/// The type of the placeholder instance in a native tree.
pub const PLACEHOLDER: &str = "NativeSlot";

struct NativeSlotRenderer;

impl ComponentRenderer for NativeSlotRenderer {
    fn render(
        &self,
        _node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        None
    }
}

struct Placeholder {
    emitter: NativeEmitter,
    reported_width: Rc<Cell<f32>>,
}

fn slot_id(props: &Map<String, Value>) -> i64 {
    props.get("slotId").and_then(Value::as_i64).unwrap_or(0)
}

impl NativeComponent for Placeholder {
    fn create(_props: &Map<String, Value>, cx: &mut NativeContext) -> Self {
        Self {
            emitter: cx.emitter(),
            reported_width: Rc::new(Cell::new(-1.0)),
        }
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
        _children: Vec<AnyElement>,
        _window: &mut Window,
        cx: &mut App,
    ) -> AnyElement {
        let host = super::native_root::slot_host(slot_id(props));
        let height = host
            .as_ref()
            .map(|host| host.read(cx).frame.h)
            .unwrap_or(0.0);
        let emitter = self.emitter.clone();
        let reported = self.reported_width.clone();
        let measured = host.clone();
        let mut element = div().relative().w_full().h(px(height));
        if let Some(host) = host {
            element = element.child(host);
        }
        element
            .child(
                canvas(
                    move |bounds, _window, cx| {
                        let width = f32::from(bounds.size.width);
                        let height = f32::from(bounds.size.height);
                        if let Some(host) = &measured {
                            let shift = host.read(cx).slot_shift.clone();
                            if let Some(shift) = shift {
                                let origin = host.read(cx).absolute_origin(cx);
                                let current = shift.get();
                                let next = point(
                                    f32::from(origin.x) + current.x - f32::from(bounds.origin.x),
                                    f32::from(origin.y) + current.y - f32::from(bounds.origin.y),
                                );
                                if next != current {
                                    shift.set(next);
                                }
                            }
                        }
                        if (reported.get() - width).abs() > 0.01 {
                            reported.set(width);
                            emitter
                                .emit("onSlotLayout", json!({ "width": width, "height": height }));
                        }
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .size_full(),
            )
            .into_any_element()
    }
}

pub fn register() {
    register_native_component::<Placeholder>(PLACEHOLDER);
    register_component_renderer(COMPONENT, Arc::new(NativeSlotRenderer));
}
