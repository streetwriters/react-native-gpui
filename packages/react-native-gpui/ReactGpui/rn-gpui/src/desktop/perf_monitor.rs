//! Perf Monitor (plan item 7.6, §9).
//!
//! A host-drawn GPUI overlay, not React Native views, so it does not disturb
//! what it measures. It shows:
//!
//! * **UI FPS** — frames the GPUI window actually presented, counted from the
//!   frame hook.
//! * **JS FPS** — `requestAnimationFrame` ticks JS reports once a second, which
//!   is the honest signal for "is the JS thread keeping up".
//! * **Memory** — resident set size of this process.
//! * **Views** — mounted Fabric nodes in the store.
//! * **Mount ms** — how long the last mount batch took to apply.

use crate::store::{store_from, SurfaceRootView};
use gpui::{
    px, App, AppContext, Context, Entity, Global, IntoElement, ParentElement, Render, Styled,
    Window,
};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// One second of history is enough for a stable rate without a long tail.
const WINDOW: Duration = Duration::from_secs(1);
/// How often the overlay's numbers are recomputed. Frames are counted by the
/// paint itself, so this is only the text refresh.
const TEXT_REFRESH: Duration = Duration::from_millis(500);

#[derive(Default)]
pub struct PerfMonitorState {
    pub enabled: bool,
    /// UI frames presented in the last second.
    ui_frames: VecDeque<Instant>,
    /// `requestAnimationFrame` ticks JS reported for the current second.
    js_ticks: VecDeque<Instant>,
    /// The most recent mount-batch duration, in milliseconds.
    pub last_mount_ms: f32,
    /// The last rate JS reported, used until the next report arrives.
    pub js_fps: f32,
}

pub struct PerfMonitorGlobal(pub RefCell<PerfMonitorState>);
impl Global for PerfMonitorGlobal {}

impl PerfMonitorState {
    fn prune(&mut self, now: Instant) {
        while self
            .ui_frames
            .front()
            .is_some_and(|at| now.duration_since(*at) > WINDOW)
        {
            self.ui_frames.pop_front();
        }
        while self
            .js_ticks
            .front()
            .is_some_and(|at| now.duration_since(*at) > WINDOW)
        {
            self.js_ticks.pop_front();
        }
    }
}

/// Install the monitor. It starts disabled: no frame bookkeeping, no overlay.
pub fn install(cx: &mut App) {
    cx.set_global(PerfMonitorGlobal(RefCell::new(PerfMonitorState::default())));
}

/// `PerfMonitor.setEnabled`.
pub fn set_enabled(cx: &mut App, enabled: bool) -> Value {
    let was_enabled = {
        let mut state = cx.global_mut::<PerfMonitorGlobal>().0.borrow_mut();
        let previous = state.enabled;
        state.enabled = enabled;
        if !enabled {
            state.ui_frames.clear();
            state.js_ticks.clear();
            state.js_fps = 0.0;
        }
        previous
    };
    if enabled && !was_enabled {
        // The overlay keeps the window drawing while it is visible: `render`
        // asks for the next frame and counts it. This loop only refreshes the
        // numbers, so the overlay's text is not re-shaped on every frame.
        cx.spawn(async move |cx| loop {
            cx.background_executor().timer(TEXT_REFRESH).await;
            let mut stop = false;
            let _ = cx.update(|cx| {
                if !is_enabled(cx) {
                    stop = true;
                    return;
                }
                let Some(store) = store_from(cx) else {
                    stop = true;
                    return;
                };
                let monitor = store
                    .read(cx)
                    .roots
                    .get(&crate::store::APP_SURFACE_ID)
                    .and_then(|root| root.read(cx).perf_monitor.clone());
                if let Some(monitor) = monitor {
                    monitor.update(cx, |_monitor, cx| cx.notify());
                }
            });
            if stop {
                break;
            }
        })
        .detach();
    }
    // A native toggle (the Dev Menu, `DevSettings.setProfilingEnabled`) has to
    // tell JS, because the JS frame counter is what reports JS FPS.
    emit_enabled(cx, enabled);
    let state = cx.global::<PerfMonitorGlobal>().0.borrow();
    json!({"enabled": state.enabled})
}

/// Tell JS that the overlay was toggled natively, so it can start or stop its
/// own frame counter (`gpuiDesktop:perfMonitor`).
fn emit_enabled(cx: &App, enabled: bool) {
    let Some(store) = store_from(cx) else {
        return;
    };
    store.read(cx).host.emit_device_event_json(
        "gpuiDesktop:perfMonitor",
        &json!({"enabled": enabled}).to_string(),
    );
}

pub fn is_enabled(cx: &App) -> bool {
    cx.try_global::<PerfMonitorGlobal>()
        .is_some_and(|state| state.0.borrow().enabled)
}

/// A presented frame. Called from the frame hook, so it costs one push when the
/// monitor is off.
pub fn record_frame(cx: &App) {
    let Some(global) = cx.try_global::<PerfMonitorGlobal>() else {
        return;
    };
    let mut state = global.0.borrow_mut();
    if !state.enabled {
        return;
    }
    let now = Instant::now();
    state.prune(now);
    state.ui_frames.push_back(now);
}

/// `PerfMonitor.jsTicks {count}`: JS reported `count` rAF ticks.
pub fn record_js_ticks(cx: &App, count: u32) {
    let Some(global) = cx.try_global::<PerfMonitorGlobal>() else {
        return;
    };
    let mut state = global.0.borrow_mut();
    if !state.enabled {
        return;
    }
    let now = Instant::now();
    state.prune(now);
    for _ in 0..count.min(1000) {
        state.js_ticks.push_back(now);
    }
    state.js_fps = state.js_ticks.len() as f32;
}

/// How long the last mount batch took, in milliseconds.
pub fn record_mount(cx: &App, millis: f32) {
    let Some(global) = cx.try_global::<PerfMonitorGlobal>() else {
        return;
    };
    let mut state = global.0.borrow_mut();
    if state.enabled {
        state.last_mount_ms = millis;
    }
}

/// `PerfMonitor.getMetrics`.
pub fn metrics(cx: &App) -> Value {
    let now = Instant::now();
    let (ui_fps, js_fps, mount_ms, enabled) = {
        let Some(global) = cx.try_global::<PerfMonitorGlobal>() else {
            return json!({"enabled": false});
        };
        let mut state = global.0.borrow_mut();
        state.prune(now);
        (
            state.ui_frames.len() as f32,
            state.js_fps,
            state.last_mount_ms,
            state.enabled,
        )
    };
    let views = store_from(cx)
        .map(|store| store.read(cx).nodes.len())
        .unwrap_or(0);
    json!({
        "enabled": enabled,
        "uiFps": ui_fps,
        "jsFps": js_fps,
        "memoryBytes": resident_memory_bytes(),
        "mountedViews": views,
        "lastMountMs": mount_ms,
    })
}

/// Resident set size of this process.
#[cfg(target_os = "macos")]
pub fn resident_memory_bytes() -> u64 {
    // `task_info(TASK_BASIC_INFO)` reports `resident_size` in bytes.
    #[repr(C)]
    #[derive(Default)]
    struct TaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: [u32; 2],
        system_time: [u32; 2],
        policy: i32,
        suspend_count: i32,
    }
    const TASK_BASIC_INFO: u32 = 4;
    extern "C" {
        fn mach_task_self() -> u32;
        fn task_info(task: u32, flavor: u32, info: *mut TaskBasicInfo, count: *mut u32) -> i32;
    }
    let mut info = TaskBasicInfo::default();
    let mut count = (std::mem::size_of::<TaskBasicInfo>() / std::mem::size_of::<u32>()) as u32;
    let result = unsafe { task_info(mach_task_self(), TASK_BASIC_INFO, &mut info, &mut count) };
    if result == 0 {
        info.resident_size
    } else {
        0
    }
}

#[cfg(target_os = "linux")]
pub fn resident_memory_bytes() -> u64 {
    // `/proc/self/statm` field 2 is resident pages.
    std::fs::read_to_string("/proc/self/statm")
        .ok()
        .and_then(|contents| {
            contents
                .split_whitespace()
                .nth(1)
                .and_then(|pages| pages.parse::<u64>().ok())
        })
        .map(|pages| pages * 4096)
        .unwrap_or(0)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn resident_memory_bytes() -> u64 {
    // Windows needs `GetProcessMemoryInfo`; not wired yet (plan step 10).
    0
}

/// The overlay itself. Created once per window and always in the element tree;
/// it draws nothing while the monitor is disabled.
pub struct PerfMonitor {
    window_id: u32,
}

impl PerfMonitor {
    pub fn new(window_id: u32) -> Self {
        Self { window_id }
    }
}

fn format_bytes(bytes: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    if bytes == 0 {
        "n/a".to_string()
    } else {
        format!("{:.0} MB", bytes as f64 / MB)
    }
}

impl Render for PerfMonitor {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if !is_enabled(cx) {
            // Kept absolute so the hidden overlay is exactly 0x0 and cannot
            // swallow input meant for the app behind it.
            return gpui::div().absolute().top_0().left_0();
        }
        // This runs once per presented frame while the overlay is visible. Asking
        // for the next frame here is what keeps them coming, and it is legal
        // from the paint phase (unlike from a timer).
        record_frame(cx);
        window.on_next_frame(|_window, cx| record_frame(cx));
        window.request_animation_frame();
        let value = metrics(cx);
        let line = |label: &str, text: String| {
            gpui::div()
                .flex()
                .gap_2()
                .child(gpui::div().w(px(74.0)).child(label.to_string()))
                .child(text)
        };
        gpui::div()
            .absolute()
            .top(px(6.0))
            .right(px(6.0))
            .px_2()
            .py_1()
            .rounded(px(4.0))
            .bg(gpui::rgba(0x00000099))
            .text_color(gpui::white())
            .text_size(px(11.0))
            .flex()
            .flex_col()
            .gap_0p5()
            .child(line(
                "UI FPS",
                format!("{:.0}", value["uiFps"].as_f64().unwrap_or(0.0)),
            ))
            .child(line(
                "JS FPS",
                format!("{:.0}", value["jsFps"].as_f64().unwrap_or(0.0)),
            ))
            .child(line("Views", format!("{}", value["mountedViews"])))
            .child(line(
                "Mount",
                format!("{:.1} ms", value["lastMountMs"].as_f64().unwrap_or(0.0)),
            ))
            .child(line(
                "Memory",
                format_bytes(value["memoryBytes"].as_u64().unwrap_or(0)),
            ))
            .child(line("Window", format!("#{}", self.window_id)))
    }
}

/// Attach the overlay to the main window's root (called from `bootstrap`).
pub fn attach(cx: &mut App, root: &Entity<SurfaceRootView>, window_id: u32) {
    let monitor = cx.new(|_| PerfMonitor::new(window_id));
    root.update(cx, |root, cx| {
        root.perf_monitor = Some(monitor);
        cx.notify();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_bytes_reports_megabytes() {
        assert_eq!(format_bytes(0), "n/a");
        assert_eq!(format_bytes(64 * 1024 * 1024), "64 MB");
    }
}
