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
    /// Identifies the newest scheduled callback. A callback whose generation
    /// was superseded (because `arm` had to re-schedule a stalled chain) stops
    /// instead of re-arming, so at most one chain is ever ticking.
    generation: Cell<u64>,
    /// Native Animated owns a real frame callback until RN reports it stopped.
    animation_active: Cell<bool>,
    /// When the outstanding callback was last run, in milliseconds since
    /// `epoch`. Used to detect a chain the platform never delivered a frame
    /// for.
    last_tick_ms: Cell<u64>,
}

impl FrameHook {
    pub fn new(host: Host) -> Self {
        Self {
            host,
            state: Rc::new(State {
                epoch: Instant::now(),
                active_until_ms: Cell::new(0),
                armed: Cell::new(false),
                generation: Cell::new(0),
                animation_active: Cell::new(false),
                last_tick_ms: Cell::new(0),
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
    ///
    /// `armed` alone is not enough to decide that the chain is running: GPUI
    /// can decline to deliver the frame a callback asked for (observed in this
    /// project's headless capture runs), and then the outstanding callback
    /// would never run, never clear `armed`, and silently block every later
    /// `arm`. If nothing has ticked for a whole activity window, re-schedule;
    /// the superseded callback stops when it eventually runs.
    pub fn arm(&self, window: &mut Window) {
        self.note_activity();
        let stalled = self.now_ms().saturating_sub(self.state.last_tick_ms.get())
            >= ACTIVITY_WINDOW.as_millis() as u64;
        if self.state.armed.get() && !stalled {
            return;
        }
        self.schedule(window);
    }

    pub fn set_animation_active(&self, active: bool, window: &mut Window) {
        self.state.animation_active.set(active);
        if active {
            self.arm(window);
        }
    }

    fn schedule(&self, window: &mut Window) {
        let hook = self.clone();
        let generation = self.state.generation.get().wrapping_add(1);
        self.state.generation.set(generation);
        self.state.armed.set(true);
        window.on_next_frame(move |window, _cx| {
            if hook.state.generation.get() != generation {
                return;
            }
            hook.state.last_tick_ms.set(hook.now_ms());
            hook.host.on_frame();
            if hook.is_active() {
                hook.schedule(window);
            } else {
                hook.state.armed.set(false);
            }
        });
    }

    fn is_active(&self) -> bool {
        self.state.animation_active.get() || self.now_ms() < self.state.active_until_ms.get()
    }

    fn now_ms(&self) -> u64 {
        self.state.epoch.elapsed().as_millis() as u64
    }
}
