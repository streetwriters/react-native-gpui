//! A `div` with listeners asks `hitbox.is_hovered` while painting, and gpui-fast
//! records that read as a dependency. This element inserts the same hitbox but
//! asks only inside its event handlers, where nothing is recorded.

use gpui::{
    canvas, prelude::*, App, DispatchPhase, HitboxBehavior, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, Window,
};
use std::rc::Rc;

pub(crate) type PointerHandler<Event> = Rc<dyn Fn(&Event, &mut Window, &mut App)>;

/// In registration order; the bubble phase runs them in reverse.
#[derive(Default)]
pub(crate) struct PointerHandlers {
    pub(crate) left_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) right_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) left_up: Vec<PointerHandler<MouseUpEvent>>,
    pub(crate) mouse_move: Vec<PointerHandler<MouseMoveEvent>>,
}

impl PointerHandlers {
    pub(crate) fn is_empty(&self) -> bool {
        self.left_down.is_empty()
            && self.right_down.is_empty()
            && self.left_up.is_empty()
            && self.mouse_move.is_empty()
    }
}

pub(crate) fn pointer_area(handlers: PointerHandlers) -> impl IntoElement {
    let PointerHandlers {
        left_down,
        right_down,
        left_up,
        mouse_move,
    } = handlers;
    canvas(
        |bounds, window, _cx| window.insert_hitbox(bounds, HitboxBehavior::Normal),
        move |_bounds, hitbox, window, _cx| {
            for handler in right_down {
                let hitbox = hitbox.clone();
                window.on_mouse_event(move |event: &MouseDownEvent, phase, window, cx| {
                    if phase == DispatchPhase::Bubble
                        && event.button == MouseButton::Right
                        && hitbox.is_hovered(window)
                    {
                        handler(event, window, cx);
                    }
                });
            }
            for handler in left_down {
                let hitbox = hitbox.clone();
                window.on_mouse_event(move |event: &MouseDownEvent, phase, window, cx| {
                    if phase == DispatchPhase::Bubble
                        && event.button == MouseButton::Left
                        && hitbox.is_hovered(window)
                    {
                        handler(event, window, cx);
                    }
                });
            }
            for handler in left_up {
                let hitbox = hitbox.clone();
                window.on_mouse_event(move |event: &MouseUpEvent, phase, window, cx| {
                    if phase == DispatchPhase::Bubble
                        && event.button == MouseButton::Left
                        && hitbox.is_hovered(window)
                    {
                        handler(event, window, cx);
                    }
                });
            }
            for handler in mouse_move {
                let hitbox = hitbox.clone();
                window.on_mouse_event(move |event: &MouseMoveEvent, phase, window, cx| {
                    if phase == DispatchPhase::Bubble && hitbox.is_hovered(window) {
                        handler(event, window, cx);
                    }
                });
            }
        },
    )
    .absolute()
    .inset_0()
    .size_full()
}
