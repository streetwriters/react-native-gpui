//! A virtual list for native trees.
//!
//! The list owns the scrolling and tells JavaScript which items are in view
//! (`onRangeChange`, `{ first, last }`). JavaScript renders items for that range
//! and a little more, as `NativeVirtualItem` children keyed by slot, so a slot
//! keeps its instance and only gets the index of another item as scrolling
//! moves on; nothing outside the range exists. Items have one height, which
//! keeps the range a division and scrolling free of layout.

use std::cell::Cell;
use std::rc::Rc;

use gpui::{canvas, div, prelude::*, px, AnyElement, App, ScrollHandle, Window};
use serde_json::{json, Map, Value};

use crate::native_tree::{
    register_native_component, NativeComponent, NativeContext, NativeEmitter,
};

pub const LIST: &str = "NativeVirtualList";
pub const ITEM: &str = "NativeVirtualItem";

fn number(props: &Map<String, Value>, name: &str) -> f32 {
    props.get(name).and_then(Value::as_f64).unwrap_or(0.0) as f32
}

struct VirtualList {
    emitter: NativeEmitter,
    scroll: ScrollHandle,
    reported: Rc<Cell<(i64, i64)>>,
}

impl NativeComponent for VirtualList {
    fn create(_props: &Map<String, Value>, cx: &mut NativeContext) -> Self {
        Self {
            emitter: cx.emitter(),
            scroll: ScrollHandle::new(),
            reported: Rc::new(Cell::new((-2, -2))),
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
        children: Vec<AnyElement>,
        _window: &mut Window,
        _cx: &mut App,
    ) -> AnyElement {
        let count = number(props, "count");
        let item_height = number(props, "itemHeight").max(1.0);
        let handle = self.scroll.clone();
        let measured = self.scroll.clone();
        let emitter = self.emitter.clone();
        let reported = self.reported.clone();
        div()
            .relative()
            .size_full()
            .child(
                div()
                    .id("native-virtual-list")
                    .size_full()
                    .overflow_y_scroll()
                    .track_scroll(&handle)
                    .child(
                        div()
                            .relative()
                            .w_full()
                            .h(px(count * item_height))
                            .children(children),
                    ),
            )
            .child(
                canvas(
                    move |bounds, _window, _cx| {
                        let top = -f32::from(measured.offset().y);
                        let view = f32::from(bounds.size.height);
                        let last_index = (count as i64) - 1;
                        let first =
                            ((top / item_height).floor() as i64).clamp(0, last_index.max(0));
                        let last = (((top + view) / item_height).ceil() as i64 - 1)
                            .clamp(first, last_index.max(0));
                        if reported.get() != (first, last) && count > 0.0 {
                            reported.set((first, last));
                            emitter.emit("onRangeChange", json!({ "first": first, "last": last }));
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

struct VirtualItem;

impl NativeComponent for VirtualItem {
    fn create(_props: &Map<String, Value>, _cx: &mut NativeContext) -> Self {
        VirtualItem
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
        let height = number(props, "itemHeight");
        div()
            .absolute()
            .left_0()
            .top(px(number(props, "index") * height))
            .w_full()
            .h(px(height))
            .overflow_hidden()
            .flex()
            .flex_col()
            .children(children)
            .into_any_element()
    }
}

pub fn register() {
    register_native_component::<VirtualList>(LIST);
    register_native_component::<VirtualItem>(ITEM);
}
