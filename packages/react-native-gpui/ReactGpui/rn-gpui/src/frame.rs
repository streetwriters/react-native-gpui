//! TODO 2.3 — the per-frame hook that ticks React Native's `EventBeat`.
//!
//! Fabric's scheduler asks the platform for a "beat" (`EventBeat::request()`)
//! when it has work that only the JS thread can finish, and the platform is
//! expected to call `onRender()` once per run-loop iteration to deliver it
//! (design doc §18.8's frame tick row: "Call `onRender()` once per GPUI
//! frame"). `ViewStore::apply_batch` already ticks it right after a mount
//! batch, but that only covers native -> JS transitions that happen to
//! produce a batch; the frame hook covers the rest.
//!
//! GPUI's frame hook is one-shot (`Window::on_next_frame` pushes a single
//! callback and asks the platform window for a frame), so the chain re-arms
//! itself from inside the callback — and only for as long as React Native has
//! work. Every sign of RN activity (`note_activity`) extends a short window;
//! once it lapses the chain stops, so an idle app stops repainting instead of
//! asking GPUI to draw at the display's refresh rate forever.
//!
//! Everything here runs on the GPUI main thread: the frame callbacks, and the
//! mount drain / native event dispatches that call `arm`. That is also why the
//! state is `Rc<Cell<..>>` rather than atomic: it is shared mutable state, not
//! a thread-safe mailbox.

use crate::host::Host;
use gpui::Window;
use std::cell::Cell;
use std::rc::Rc;
use std::time::{Duration, Instant};

/// How long the frame chain keeps ticking after the last sign of RN work.
/// Comfortably longer than a frame (16.7 ms at 60 Hz), so the chain is still
/// running when the next commit lands, and so an animation driven from a timer
/// or `requestAnimationFrame` never misses a frame.
const ACTIVITY_WINDOW: Duration = Duration::from_millis(500);

#[derive(Clone)]
pub struct FrameHook {
    host: Host,
    state: Rc<State>,
}

struct State {
    epoch: Instant,
    /// Milliseconds since `epoch` until which the chain re-arms.
    active_until_ms: Cell<u64>,
    /// Whether a frame callback is currently outstanding.
    armed: Cell<bool>,
}

impl FrameHook {
    pub fn new(host: Host) -> Self {
        Self {
            host,
            state: Rc::new(State {
                epoch: Instant::now(),
                active_until_ms: Cell::new(0),
                armed: Cell::new(false),
            }),
        }
    }

    /// Keeps the chain alive for the next `ACTIVITY_WINDOW`.
    fn note_activity(&self) {
        self.state
            .active_until_ms
            .set(self.now_ms() + ACTIVITY_WINDOW.as_millis() as u64);
    }

    /// Arms the chain if it is not already running, and notes RN activity.
    pub fn arm(&self, window: &mut Window) {
        self.note_activity();
        if self.state.armed.replace(true) {
            return;
        }
        self.schedule(window);
    }

    fn schedule(&self, window: &mut Window) {
        let hook = self.clone();
        window.on_next_frame(move |window, _cx| {
            hook.host.on_render();
            if hook.is_active() {
                hook.schedule(window);
            } else {
                hook.state.armed.set(false);
            }
        });
    }

    fn is_active(&self) -> bool {
        self.now_ms() < self.state.active_until_ms.get()
    }

    fn now_ms(&self) -> u64 {
        self.state.epoch.elapsed().as_millis() as u64
    }
}
