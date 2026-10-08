//! Desktop shell: application menu, context menus, tray, windows, Dev Menu and
//! the Perf Monitor (plan items 7.1–7.6).
//!
//! Everything here runs on the GPUI main thread. The JS side talks to it
//! through one core TurboModule (`GpuiDesktop`): `call(domain, method, args)`
//! becomes [`MainEvent::Desktop`](crate::bootstrap) and is answered with
//! `rn_gpui_desktop_result`. See `.local/desktop-shell.md` §3.
//!
//! Module layout mirrors the plan:
//! * [`errors`] — the one error shape (`{code, message}`).
//! * [`capabilities`] — platform capability flags for `getSnapshot`.

pub mod app_menu;
pub mod capabilities;
pub mod context_menu;
pub mod errors;
pub mod menu_model;
pub mod perf_monitor;
pub mod platform_window;
pub mod windows;

pub use errors::{DesktopError, DesktopResult};

use gpui::App;
use std::sync::OnceLock;

/// Values `getSnapshot` can answer without the GPUI main thread. Written once
/// at startup, before the JS bundle loads.
#[derive(Clone)]
pub struct Snapshot {
    pub app_id: String,
    pub platform: &'static str,
}

static SNAPSHOT: OnceLock<Snapshot> = OnceLock::new();

/// Install the synchronous snapshot handler. Must run before `load_script`, so
/// a module that reads a capability during initialization sees the real value.
pub fn install_snapshot(app_id: &str) {
    let _ = SNAPSHOT.set(Snapshot {
        app_id: app_id.to_string(),
        platform: std::env::consts::OS,
    });
    let _ = rn_gpui_sys::DESKTOP_SNAPSHOT_HANDLER.set(Box::new(snapshot_value));
}

/// The `key -> json` reader behind `GpuiDesktop.getSnapshot`. Runs on the JS
/// thread, so it only touches the immutable [`Snapshot`] and constants.
fn snapshot_value(key: &str) -> String {
    let value = match key {
        capabilities::SNAPSHOT_KEY => capabilities::capabilities(),
        "appId" => serde_json::Value::String(
            SNAPSHOT
                .get()
                .map(|snapshot| snapshot.app_id.clone())
                .unwrap_or_default(),
        ),
        "platform" => serde_json::Value::String(
            SNAPSHOT
                .get()
                .map(|snapshot| snapshot.platform.to_string())
                .unwrap_or_else(|| std::env::consts::OS.to_string()),
        ),
        _ => serde_json::Value::Null,
    };
    serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string())
}

/// Handle one `GpuiDesktop.call` on the GPUI main thread and answer it exactly
/// once.
pub fn dispatch(cx: &mut App, id: i32, domain: &str, method: &str, args_json: &str) {
    // A context menu answers when it closes, not now.
    if (domain, method) == ("contextMenu", "show") {
        if let Err(error) = context_menu::show(cx, id, args_json) {
            answer(cx, id, Err(error));
        }
        return;
    }
    let result = match (domain, method) {
        ("app", "getInfo") => app_info(),
        ("app", "getCapabilities") => Ok(capabilities::capabilities()),
        ("app", "echo") => echo(args_json),
        ("window", "open") => window_open(cx, args_json),
        ("window", "close") => window_close(cx, args_json),
        ("window", "list") => windows::list_windows(cx),
        ("window", "getState") => window_state(cx, args_json),
        ("window", "focus") => window_focus(cx, args_json),
        ("window", "setTitle") => window_simple(cx, args_json, |cx, key, args| {
            let title = args
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string();
            windows::set_title(cx, key, title)
        }),
        ("window", "setSize") => window_size(cx, args_json, windows::set_size),
        ("window", "setPosition") => window_position(cx, args_json),
        ("window", "setMinSize") => window_size(cx, args_json, windows::set_min_size),
        ("window", "setMaxSize") => window_size(cx, args_json, windows::set_max_size),
        ("window", "setResizable") => window_bool(cx, args_json, windows::set_resizable),
        ("window", "setAlwaysOnTop") => window_bool(cx, args_json, windows::set_always_on_top),
        ("window", "setFullscreen") => window_bool(cx, args_json, windows::set_fullscreen),
        ("window", "minimize") => window_plain(cx, args_json, windows::minimize),
        ("window", "maximize") => window_plain(cx, args_json, windows::maximize),
        ("window", "unmaximize") => window_plain(cx, args_json, windows::unmaximize),
        ("window", "toggleMaximize") => window_plain(cx, args_json, windows::toggle_maximize),
        ("window", "show") => window_plain(cx, args_json, windows::show),
        ("window", "hide") => window_plain(cx, args_json, windows::hide),
        ("window", "startDragging") => window_plain(cx, args_json, windows::start_dragging),
        ("window", "interceptClose") => window_intercept_close(cx, args_json),
        ("menu", "set") => menu_set(cx, args_json),
        ("menu", "update") => menu_update(cx, args_json),
        ("menu", "get") => menu_get(cx, args_json),
        ("perfMonitor", "setEnabled") => perf_set_enabled(cx, args_json),
        ("perfMonitor", "getMetrics") => Ok(perf_monitor::metrics(cx)),
        ("perfMonitor", "jsTicks") => perf_js_ticks(cx, args_json),
        _ => Err(DesktopError::not_found(format!(
            "unknown desktop method: {domain}.{method}"
        ))),
    };
    answer(cx, id, result);
}

/// Parse `args_json` as an object, rejecting anything else.
fn parse_args(args_json: &str) -> Result<serde_json::Map<String, serde_json::Value>, DesktopError> {
    let value: serde_json::Value = serde_json::from_str(args_json)
        .map_err(|error| DesktopError::invalid_argument(format!("invalid args JSON: {error}")))?;
    match value {
        serde_json::Value::Object(object) => Ok(object),
        _ => Err(DesktopError::invalid_argument("args must be a JSON object")),
    }
}

fn arg_f32(args: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<f32> {
    args.get(key)
        .and_then(serde_json::Value::as_f64)
        .map(|value| value as f32)
        .filter(|value| value.is_finite())
}

fn arg_window_id(args: &serde_json::Map<String, serde_json::Value>) -> Result<u32, DesktopError> {
    args.get("windowId")
        .and_then(serde_json::Value::as_u64)
        .map(|value| value as u32)
        .ok_or_else(|| DesktopError::invalid_argument("a numeric windowId is required"))
}

fn window_open(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let component = args
        .get("component")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| DesktopError::invalid_argument("window.open requires a component"))?
        .to_string();
    let mut options = windows::OpenWindowOptions {
        component,
        props: args.get("props").cloned().filter(|value| value.is_object()),
        title: args
            .get("title")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        width: arg_f32(&args, "width"),
        height: arg_f32(&args, "height"),
        x: arg_f32(&args, "x"),
        y: arg_f32(&args, "y"),
        resizable: args
            .get("resizable")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(true),
        appears_transparent: args
            .get("titleBar")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|value| value == "transparent"),
        traffic_light_position: None,
        role: windows::WindowRoleOverride::Secondary,
    };
    if let Some(position) = args.get("trafficLightPosition").and_then(|v| v.as_object()) {
        let x = position.get("x").and_then(serde_json::Value::as_f64);
        let y = position.get("y").and_then(serde_json::Value::as_f64);
        if let (Some(x), Some(y)) = (x, y) {
            options.traffic_light_position = Some((x as f32, y as f32));
        }
    }
    let key = windows::open_window(cx, options)?;
    Ok(serde_json::json!({"windowId": key}))
}

fn window_close(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let key = arg_window_id(&args)?;
    let force = args
        .get("force")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    windows::close(cx, key, force)
}

fn window_state(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let key = arg_window_id(&args)?;
    windows::window_state(cx, key)
}

fn window_focus(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let key = arg_window_id(&args)?;
    windows::focus(cx, key)
}

/// `(cx, key, args)` handler shape for the simple window commands.
fn window_simple(
    cx: &mut App,
    args_json: &str,
    handler: impl FnOnce(&mut App, u32, &serde_json::Map<String, serde_json::Value>) -> DesktopResult,
) -> DesktopResult {
    let args = parse_args(args_json)?;
    let key = arg_window_id(&args)?;
    handler(cx, key, &args)
}

fn window_size(
    cx: &mut App,
    args_json: &str,
    handler: impl FnOnce(&mut App, u32, f32, f32) -> DesktopResult,
) -> DesktopResult {
    window_simple(cx, args_json, move |cx, key, args| {
        let width = arg_f32(args, "width")
            .ok_or_else(|| DesktopError::invalid_argument("a numeric width is required"))?;
        let height = arg_f32(args, "height")
            .ok_or_else(|| DesktopError::invalid_argument("a numeric height is required"))?;
        handler(cx, key, width, height)
    })
}

fn window_bool(
    cx: &mut App,
    args_json: &str,
    handler: impl FnOnce(&mut App, u32, bool) -> DesktopResult,
) -> DesktopResult {
    window_simple(cx, args_json, move |cx, key, args| {
        let value = args
            .get("value")
            .and_then(serde_json::Value::as_bool)
            .ok_or_else(|| DesktopError::invalid_argument("a boolean value is required"))?;
        handler(cx, key, value)
    })
}

fn window_plain(
    cx: &mut App,
    args_json: &str,
    handler: impl FnOnce(&mut App, u32) -> DesktopResult,
) -> DesktopResult {
    window_simple(cx, args_json, move |cx, key, _args| handler(cx, key))
}

fn window_position(cx: &mut App, args_json: &str) -> DesktopResult {
    window_simple(cx, args_json, |cx, key, args| {
        let x = arg_f32(args, "x")
            .ok_or_else(|| DesktopError::invalid_argument("a numeric x is required"))?;
        let y = arg_f32(args, "y")
            .ok_or_else(|| DesktopError::invalid_argument("a numeric y is required"))?;
        windows::set_position(cx, key, x, y)
    })
}

fn menu_set(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    // `items: null` restores the default menu.
    let items = match args.get("items") {
        None | Some(serde_json::Value::Null) => None,
        Some(value) => Some(value),
    };
    app_menu::set_application_menu(cx, items)
}

fn perf_set_enabled(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let enabled = args
        .get("enabled")
        .and_then(serde_json::Value::as_bool)
        .ok_or_else(|| DesktopError::invalid_argument("a boolean `enabled` is required"))?;
    Ok(perf_monitor::set_enabled(cx, enabled))
}

fn perf_js_ticks(cx: &App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let count = args
        .get("count")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0) as u32;
    perf_monitor::record_js_ticks(cx, count);
    Ok(serde_json::json!({"count": count}))
}

fn menu_get(cx: &App, args_json: &str) -> DesktopResult {
    let _ = parse_args(args_json)?;
    Ok(app_menu::menu_json(cx))
}

fn menu_update(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let id = args
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| DesktopError::invalid_argument("menu.update requires an id"))?;
    let patch = args
        .get("patch")
        .ok_or_else(|| DesktopError::invalid_argument("menu.update requires a patch"))?;
    app_menu::update_item(cx, id, patch)
}

fn window_intercept_close(cx: &mut App, args_json: &str) -> DesktopResult {
    let args = parse_args(args_json)?;
    let key = arg_window_id(&args)?;
    let on = args
        .get("on")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let entry = cx
        .global_mut::<windows::DesktopWindowsGlobal>()
        .0
        .get_mut(key)
        .ok_or_else(|| DesktopError::not_found(format!("window {key} is not open")))?;
    entry.intercept_close = on;
    Ok(serde_json::json!({"windowId": key, "interceptClose": on}))
}

/// Answer a desktop request. Split out so every handler path answers exactly
/// once, success or failure.
pub fn answer(_cx: &mut App, id: i32, result: DesktopResult) {
    match result {
        Ok(value) => {
            let json = serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string());
            rn_gpui_sys::ffi::rn_gpui_desktop_result(id, true, json);
        }
        Err(error) => {
            log::warn!("[desktop] request {id} failed: {error}");
            rn_gpui_sys::ffi::rn_gpui_desktop_result(id, false, error.to_json());
        }
    }
}

fn app_info() -> DesktopResult {
    Ok(serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "capabilities": capabilities::capabilities(),
    }))
}

/// Debug helper used by the bridge's own tests: echoes a JSON object back.
fn echo(args_json: &str) -> DesktopResult {
    let value: serde_json::Value = serde_json::from_str(args_json)
        .map_err(|error| DesktopError::invalid_argument(format!("invalid args JSON: {error}")))?;
    Ok(value)
}
