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

pub mod capabilities;
pub mod errors;

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
    let result = match (domain, method) {
        ("app", "getInfo") => app_info(),
        ("app", "getCapabilities") => Ok(capabilities::capabilities()),
        ("app", "echo") => echo(args_json),
        _ => Err(DesktopError::not_found(format!(
            "unknown desktop method: {domain}.{method}"
        ))),
    };
    answer(cx, id, result);
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
