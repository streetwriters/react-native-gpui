//! A `div` with listeners asks `hitbox.is_hovered` while painting, and gpui-fast
//! records that read as a dependency. This element inserts the same hitbox but
//! asks only inside its event handlers, where nothing is recorded.

use gpui::{
    canvas, prelude::*, App, DispatchPhase, HitboxBehavior, MouseButton, MouseDownEvent,
    MouseMoveEvent, MouseUpEvent, NavigationDirection, Window,
};
use std::rc::Rc;

pub(crate) type PointerHandler<Event> = Rc<dyn Fn(&Event, &mut Window, &mut App)>;

/// The buttons a listener can be registered for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum PointerButton {
    Left,
    Right,
    Middle,
    Back,
    Forward,
}

impl PointerButton {
    pub(crate) fn from_gpui(button: MouseButton) -> Option<Self> {
        match button {
            MouseButton::Left => Some(PointerButton::Left),
            MouseButton::Right => Some(PointerButton::Right),
            MouseButton::Middle => Some(PointerButton::Middle),
            // The two side buttons arrive as one variant plus a direction.
            MouseButton::Navigate(direction) => Some(match direction {
                NavigationDirection::Back => PointerButton::Back,
                NavigationDirection::Forward => PointerButton::Forward,
            }),
            _ => None,
        }
    }

    /// The DOM's button number, which is what `events::Button` reports too.
    pub(crate) fn number(self) -> i32 {
        match self {
            PointerButton::Left => 0,
            PointerButton::Middle => 1,
            PointerButton::Right => 2,
            PointerButton::Back => 3,
            PointerButton::Forward => 4,
        }
    }
}

/// Every button, in the order the DOM numbers them, so the listeners for one
/// element fire in a stable order regardless of registration.
const POINTER_BUTTONS: [PointerButton; 5] = [
    PointerButton::Left,
    PointerButton::Middle,
    PointerButton::Right,
    PointerButton::Back,
    PointerButton::Forward,
];

/// In registration order; the bubble phase runs them in reverse.
#[derive(Default)]
pub(crate) struct PointerHandlers {
    pub(crate) left_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) right_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) left_up: Vec<PointerHandler<MouseUpEvent>>,
    pub(crate) right_up: Vec<PointerHandler<MouseUpEvent>>,
    pub(crate) middle_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) middle_up: Vec<PointerHandler<MouseUpEvent>>,
    /// The side buttons, which are rare enough not to deserve a field each.
    pub(crate) back_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) forward_down: Vec<PointerHandler<MouseDownEvent>>,
    pub(crate) back_up: Vec<PointerHandler<MouseUpEvent>>,
    pub(crate) forward_up: Vec<PointerHandler<MouseUpEvent>>,
    pub(crate) mouse_move: Vec<PointerHandler<MouseMoveEvent>>,
}

impl PointerHandlers {
    pub(crate) fn is_empty(&self) -> bool {
        POINTER_BUTTONS
            .iter()
            .all(|button| self.down(*button).is_empty() && self.up(*button).is_empty())
            && self.mouse_move.is_empty()
    }

    fn down(&self, button: PointerButton) -> &Vec<PointerHandler<MouseDownEvent>> {
        match button {
            PointerButton::Left => &self.left_down,
            PointerButton::Right => &self.right_down,
            PointerButton::Middle => &self.middle_down,
            PointerButton::Back => &self.back_down,
            PointerButton::Forward => &self.forward_down,
        }
    }

    fn up(&self, button: PointerButton) -> &Vec<PointerHandler<MouseUpEvent>> {
        match button {
            PointerButton::Left => &self.left_up,
            PointerButton::Right => &self.right_up,
            PointerButton::Middle => &self.middle_up,
            PointerButton::Back => &self.back_up,
            PointerButton::Forward => &self.forward_up,
        }
    }
}

pub(crate) fn pointer_area(handlers: PointerHandlers) -> impl IntoElement {
    canvas(
        |bounds, window, _cx| window.insert_hitbox(bounds, HitboxBehavior::Normal),
        move |_bounds, hitbox, window, _cx| {
            // Every button, including the ones nothing currently registers, so
            // adding a listener for a middle click needs no change here.
            for button in POINTER_BUTTONS {
                for handler in handlers.down(button).clone() {
                    let hitbox = hitbox.clone();
                    window.on_mouse_event(move |event: &MouseDownEvent, phase, window, cx| {
                        if phase == DispatchPhase::Bubble
                            && PointerButton::from_gpui(event.button) == Some(button)
                            && hitbox.is_hovered(window)
                        {
                            handler(event, window, cx);
                        }
                    });
                }
                for handler in handlers.up(button).clone() {
                    let hitbox = hitbox.clone();
                    window.on_mouse_event(move |event: &MouseUpEvent, phase, window, cx| {
                        if phase == DispatchPhase::Bubble
                            && PointerButton::from_gpui(event.button) == Some(button)
                            && hitbox.is_hovered(window)
                        {
                            handler(event, window, cx);
                        }
                    });
                }
            }
            for handler in handlers.mouse_move {
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
