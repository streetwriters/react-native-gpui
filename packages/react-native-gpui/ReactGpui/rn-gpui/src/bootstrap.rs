//! GPUI window and React Native runtime bootstrap.
//!
//! Shape follows the design doc §18.10, with the API adjustments the pinned
//! gpui rev needs (`gpui_platform::application()` instead of the doc's
//! `Application::new()`).
//!
//! Environment:
//!   RN_GPUI_APP_ID      optional app id override; generated apps default from app.json
//!   RN_GPUI_DEV_HOST    dev server host (default localhost)
//!   RN_GPUI_DEV_PORT    dev server port (default 8081)
//!   RN_GPUI_BUNDLE      path to the JS bundle file
//!   RN_GPUI_SOURCE_URL  source path handed to `ReactHost::loadScript`, i.e. the
//!                       dev server bundle to fetch as
//!                       `http://<host>:<port>/<source path>.bundle?platform=gpui`
//!                       (default index). The prebuilt bundle at RN_GPUI_BUNDLE
//!                       is the fallback when the dev server is unreachable.
//!   RN_GPUI_MODULE      optional registered component name override; apps default from app.json
//!   RN_GPUI_WIDTH/HEIGHT  surface constraints (default 800/600)
//!   (visual-capture) RN_GPUI_SCALE       overrides the Fabric display scale;
//!                       default the window's `scale_factor()` is used, so a
//!                       Retina display gets `@2x` and a 1x display `@1x`
//!   (visual-capture) RN_GPUI_RUN_MS      close the window after N ms
//!   (visual-capture) RN_GPUI_RESIZE_MS   after N ms resize the window to
//!                       RN_GPUI_RESIZE_WIDTH x RN_GPUI_RESIZE_HEIGHT
//!                       (defaults 1200x400); 0 (default) = never. This is the
//!                       verification hook that drives the same `on_resize`
//!                       path as a mouse drag.
//!   RN_GPUI_SCREENSHOT  with `--features visual-capture`: render the window's
//!                       scene to this PNG path after the first mount batch,
//!                       then quit (see the feature docs in Cargo.toml)
//!   (visual-capture) RN_GPUI_WINDOW_STATE override the persisted window-state path
//!   RN_GPUI_STARTUP_TRACE (visual-capture) print startup stages to stderr
//!   (visual-capture) RN_GPUI_SCREENSHOT_DELAY_MS  wait after the first batch
//!                       before capturing (default 500). Raise it past
//!                       RN_GPUI_RESIZE_MS to capture the resized scene.
//!   (visual-capture) RN_GPUI_CLICK       `"x,y;x,y"` synthetic left clicks
//!   (visual-capture) RN_GPUI_DRAG        `"x,y:x,y[:cancel];..."` drags
//!                       coordinates, dispatched as real GPUI mouse events
//!                       (TODO 2.4)
//!   (visual-capture) RN_GPUI_CLICK_MS    delay before each click (default 1500)
//!   (visual-capture) RN_GPUI_HOVER       `"x,y;x,y"` synthetic pointer moves
//!                       GPUI mouse-move events (TODO 2.5)
//!   (visual-capture) RN_GPUI_HOVER_MS    delay before each move (default 1500)
//!
//! Synthetic input and visual capture settings are only read when built with
//! `--features visual-capture`; normal app builds do not include those hooks.

use crate::host::Host;
use crate::store::{OverlayHost, StoreGlobal, SurfaceRootView, ViewStore, APP_SURFACE_ID};
use gpui::{point, px, size, App, AppContext, Application, Bounds, WindowBounds, WindowOptions};
use rn_gpui_sys::ffi::MountBatch;
use std::cell::Cell;
use std::rc::Rc;
use std::time::Duration;

unsafe extern "C" {
    fn rn_gpui_mount_batch_applied();
}

fn env_string(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn startup_trace(stage: &str) {
    #[cfg(feature = "visual-capture")]
    {
        static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        if *ENABLED.get_or_init(|| std::env::var_os("RN_GPUI_STARTUP_TRACE").is_some()) {
            eprintln!("[rn-gpui startup] {stage}");
        }
    }
    #[cfg(not(feature = "visual-capture"))]
    let _ = stage;
}

fn window_state_path(app_id: &str) -> std::path::PathBuf {
    #[cfg(feature = "visual-capture")]
    if let Some(path) = std::env::var_os("RN_GPUI_WINDOW_STATE") {
        return path.into();
    }
    let safe_id = app_id.replace(
        |c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_',
        "_",
    );
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|home| std::path::PathBuf::from(home).join("Library/Application Support"));
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(std::path::PathBuf::from);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".config"))
        });
    base.unwrap_or_else(std::env::temp_dir)
        .join("rn-gpui")
        .join(format!("{safe_id}-window.json"))
}

fn load_window_bounds(path: &std::path::Path) -> Option<(f32, f32, f32, f32)> {
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    let number = |key| value.get(key)?.as_f64().map(|value| value as f32);
    let (x, y, width, height) = (
        number("x")?,
        number("y")?,
        number("width")?,
        number("height")?,
    );
    (x.is_finite()
        && y.is_finite()
        && width.is_finite()
        && height.is_finite()
        && width >= 320.0
        && height >= 240.0)
        .then_some((x, y, width, height))
}

fn save_window_bounds(
    path: &std::path::Path,
    bounds: Bounds<gpui::Pixels>,
    viewport: gpui::Size<gpui::Pixels>,
) {
    let value = serde_json::json!({
        "x": f32::from(bounds.origin.x),
        "y": f32::from(bounds.origin.y),
        // Persist the content size used in `WindowBounds`; GPUI adds the
        // platform title-bar inset to `window.bounds()` on restore.
        "width": f32::from(viewport.width),
        "height": f32::from(viewport.height),
    });
    let result = (|| -> std::io::Result<()> {
        let parent = path.parent().expect("window state path has a parent");
        std::fs::create_dir_all(parent)?;
        let temporary = path.with_extension("json.tmp");
        std::fs::write(
            &temporary,
            serde_json::to_vec(&value).expect("serializable window bounds"),
        )?;
        std::fs::rename(temporary, path)
    })();
    if let Err(error) = result {
        log::warn!(
            "could not save window bounds to {}: {error}",
            path.display()
        );
    }
}

fn env_f32(key: &str, default: f32) -> f32 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

#[cfg(feature = "visual-capture")]
fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes"))
        .unwrap_or(default)
}

#[cfg(feature = "visual-capture")]
fn env_opt_f32(key: &str) -> Option<f32> {
    std::env::var(key).ok().and_then(|value| value.parse().ok())
}

/// `RN_GPUI_CLICK="400,150;400,200"` — synthetic clicks at window coordinates,
/// for the headless "Done when" checks (TODO 2.4: the Pressable counter).
#[cfg(feature = "visual-capture")]
fn env_points(key: &str) -> Vec<(f32, f32)> {
    std::env::var(key)
        .ok()
        .map(|value| {
            value
                .split(';')
                .filter_map(|pair| {
                    let (x, y) = pair.split_once(',')?;
                    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// `RN_GPUI_DRAG="100,120:420,160;200,200:240,240:cancel"` — primary drags.
#[cfg(feature = "visual-capture")]
fn env_drags(key: &str) -> Vec<(f32, f32, f32, f32, bool)> {
    std::env::var(key)
        .unwrap_or_default()
        .split(';')
        .filter_map(|entry| {
            let mut parts = entry.split(':');
            let start = parts.next()?;
            let end = parts.next()?;
            let cancel = parts.next().is_some_and(|phase| phase.trim() == "cancel");
            let (start_x, start_y) = start.split_once(',')?;
            let (end_x, end_y) = end.split_once(',')?;
            Some((
                start_x.trim().parse().ok()?,
                start_y.trim().parse().ok()?,
                end_x.trim().parse().ok()?,
                end_y.trim().parse().ok()?,
                cancel,
            ))
        })
        .collect()
}

#[cfg(feature = "visual-capture")]
fn env_scrolls(key: &str) -> Vec<(f32, f32, f32, f32)> {
    std::env::var(key)
        .unwrap_or_default()
        .split(';')
        .filter_map(|entry| {
            let mut values = entry
                .split(',')
                .filter_map(|v| v.trim().parse::<f32>().ok());
            Some((
                values.next()?,
                values.next()?,
                values.next()?,
                values.next()?,
            ))
        })
        .collect()
}

/// Flushes React Native's queued JS work the way a frame tick does.
///
/// `Host::on_render` drives the run-loop observer `RuntimeScheduler` runs its
/// work from; the app calls it once per GPUI frame through `FrameHook`. macOS
/// stops delivering frames while the display is asleep, and the JS work a
/// synthetic click or hover queued then never runs — observed as `Pressed 0
/// times` in a capture whose forced draw still painted correctly. Verification
/// must not depend on the display being awake, so the synthetic input loops in
/// `main` call this after each dispatch.
#[cfg(feature = "visual-capture")]
async fn flush_js(host: &Host, cx: &mut gpui::AsyncApp) {
    for _ in 0..6 {
        host.on_render();
        cx.background_executor()
            .timer(Duration::from_millis(16))
            .await;
    }
}

/// Everything C++ (JS/Fabric thread) sends to the GPUI main thread over one
/// channel, so the drain task applies it in the order it happened.
enum MainEvent {
    /// A Fabric transaction. `apply_batch` mounts it.
    Mount(MountBatch),
    /// TODO 2.6 — a surface went away (or, with `rn_gpui_sys::ALL_SURFACES`, the
    /// whole instance: a reload). The store drops that tree.
    SurfaceStopped(i32),
    /// A direct native animated props update (currently opacity only).
    AnimatedProps(rn_gpui_sys::ffi::AnimatedPropsFlat),
    /// Keep GPUI's one-shot frame chain running while RN has active animation.
    AnimatedActivity(bool),
    /// RN TextInput commands are dispatched from Fabric and applied on GPUI's
    /// main thread, where the target entity's focus handle is owned.
    TextInputCommand {
        tag: i32,
        focus: bool,
    },
    AccessibilityFocus(i32),
    TextInputClear(i32),
    OpenUrl(String),
    AlertRequest {
        id: i32,
        title: String,
        message: String,
        buttons: Vec<String>,
    },
    ClipboardRead(i32),
    ClipboardWrite(String),
}

pub type WindowOptionsHook = Box<dyn FnOnce(&mut WindowOptions) + 'static>;
pub type AppReadyHook = Box<dyn FnOnce(&mut App) + 'static>;
pub type WindowOpenedHook = Box<dyn FnOnce(gpui::WindowId, &mut gpui::Window, &mut App) + 'static>;

/// Per-project launch settings for a GPUI desktop app.
///
/// The defaults preserve the runtime's existing behavior, including restoring
/// the last window size and position. Setters below let `desktop/src/main.rs`
/// override those defaults without forking the runtime bootstrap.
pub struct DesktopAppConfig {
    pub app_id: String,
    pub module: String,
    pub width: f32,
    pub height: f32,
    pub title: Option<String>,
    pub position: Option<(f32, f32)>,
    pub restore_window_state: bool,
    pub configure_window: Option<WindowOptionsHook>,
    pub on_app_ready: Option<AppReadyHook>,
    pub on_window_opened: Option<WindowOpenedHook>,
}

impl DesktopAppConfig {
    /// Read app identity and initial surface dimensions from environment
    /// overrides, using generic defaults for applications that do not provide
    /// build-time app metadata.
    pub fn from_env() -> Self {
        Self::from_env_with_defaults("App", "com.example.rngpui")
    }

    /// Read runtime overrides while using the app name and identifier parsed
    /// from the consuming project's `app.json` by its desktop build script.
    pub fn from_env_with_defaults(module: &str, app_id: &str) -> Self {
        Self {
            app_id: env_string("RN_GPUI_APP_ID", app_id),
            module: env_string("RN_GPUI_MODULE", module),
            width: env_f32("RN_GPUI_WIDTH", 800.0),
            height: env_f32("RN_GPUI_HEIGHT", 600.0),
            title: None,
            position: None,
            restore_window_state: true,
            configure_window: None,
            on_app_ready: None,
            on_window_opened: None,
        }
    }

    pub fn window_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    pub fn window_size(mut self, width: f32, height: f32) -> Self {
        self.width = width.max(320.0);
        self.height = height.max(240.0);
        self
    }

    /// Set the initial top-left position in GPUI screen coordinates.
    pub fn window_position(mut self, x: f32, y: f32) -> Self {
        self.position = Some((x, y));
        self
    }

    /// Disable persistent size and position restore when the app should always
    /// start from the configured initial geometry.
    pub fn restore_window_state(mut self, restore: bool) -> Self {
        self.restore_window_state = restore;
        self
    }

    /// Customize GPUI window options, including titlebar and resize behavior.
    pub fn configure_window(
        mut self,
        configure: impl FnOnce(&mut WindowOptions) + 'static,
    ) -> Self {
        self.configure_window = Some(Box::new(configure));
        self
    }

    /// Install GPUI app-level services before the React Native window opens.
    pub fn on_app_ready(mut self, callback: impl FnOnce(&mut App) + 'static) -> Self {
        self.on_app_ready = Some(Box::new(callback));
        self
    }

    /// Access the live GPUI window to adjust its title or use other GPUI window
    /// APIs once the native window exists.
    pub fn on_window_opened(
        mut self,
        callback: impl FnOnce(gpui::WindowId, &mut gpui::Window, &mut App) + 'static,
    ) -> Self {
        self.on_window_opened = Some(Box::new(callback));
        self
    }
}

impl Default for DesktopAppConfig {
    fn default() -> Self {
        Self::from_env()
    }
}

pub fn run() {
    run_with(DesktopAppConfig::from_env());
}

/// Launch the React Native desktop runtime with project-specific GPUI settings.
pub fn run_with(mut config: DesktopAppConfig) {
    #[cfg(not(feature = "test-driver"))]
    if std::env::var_os("RN_GPUI_TEST_DRIVER").is_some_and(|value| value != "0") {
        panic!("RN_GPUI_TEST_DRIVER is enabled, but this app was not built with --features test-driver");
    }
    startup_trace("main entered");
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    let bundle = env_string(
        "RN_GPUI_BUNDLE",
        "packages/rn-gpui-tester/desktop/build/index.bundle",
    );
    // TODO 2.1: this is the dev server's bundle path, not a URL — the cxx
    // `DevServerHelper` composes `http://<host>:<port>/<source path>.bundle`.
    let source_url = env_string("RN_GPUI_SOURCE_URL", "index");
    let app_id = config.app_id.clone();
    let dev_host = env_string("RN_GPUI_DEV_HOST", "localhost");
    let dev_port = env_u32("RN_GPUI_DEV_PORT", 8081);
    let module = config.module.clone();
    let width = config.width;
    let height = config.height;
    let window_state_path = window_state_path(&app_id);
    // TODO 2.2: the display scale comes from the window (see below); the env
    // var is an escape hatch for tests on a machine with a different display.
    #[cfg(feature = "visual-capture")]
    let scale_override = env_opt_f32("RN_GPUI_SCALE");
    #[cfg(not(feature = "visual-capture"))]
    let scale_override: Option<f32> = None;
    #[cfg(feature = "visual-capture")]
    let run_ms = env_u32("RN_GPUI_RUN_MS", 0);
    #[cfg(feature = "perf-timing")]
    let benchmark_ms = env_u32("RN_GPUI_BENCHMARK_MS", 0);
    #[cfg(feature = "perf-timing")]
    let benchmark_mode = crate::store::benchmark_mode()
        .unwrap_or("unspecified")
        .to_owned();
    #[cfg(feature = "visual-capture")]
    let resize_ms = env_u32("RN_GPUI_RESIZE_MS", 0);
    #[cfg(feature = "visual-capture")]
    let resize_width = env_f32("RN_GPUI_RESIZE_WIDTH", 1200.0);
    #[cfg(feature = "visual-capture")]
    let resize_height = env_f32("RN_GPUI_RESIZE_HEIGHT", 400.0);
    // TODO 2.4 — synthetic clicks, spaced `RN_GPUI_CLICK_MS` apart, starting
    // after the first batch is on screen.
    #[cfg(feature = "visual-capture")]
    let clicks = env_points("RN_GPUI_CLICK");
    #[cfg(feature = "visual-capture")]
    let click_ms = env_u32("RN_GPUI_CLICK_MS", 1500);
    #[cfg(feature = "visual-capture")]
    let click_hold_ms = env_u32("RN_GPUI_CLICK_HOLD_MS", 0);
    #[cfg(feature = "visual-capture")]
    let drags = env_drags("RN_GPUI_DRAG");
    #[cfg(feature = "visual-capture")]
    let drag_ms = env_u32("RN_GPUI_DRAG_MS", 1800);
    #[cfg(feature = "visual-capture")]
    let drag_start_ms = env_u32("RN_GPUI_DRAG_START_MS", drag_ms);
    #[cfg(feature = "visual-capture")]
    let skip_synthetic_input_flush = env_bool("RN_GPUI_SKIP_INPUT_FLUSH", false);
    // TODO 2.5 — synthetic hover: `RN_GPUI_HOVER="400,150;400,200"` moves the
    // pointer without holding a button, `RN_GPUI_HOVER_MS` apart.
    #[cfg(feature = "visual-capture")]
    let hovers = env_points("RN_GPUI_HOVER");
    #[cfg(feature = "visual-capture")]
    let hover_ms = env_u32("RN_GPUI_HOVER_MS", 800);
    #[cfg(feature = "visual-capture")]
    let scrolls = env_scrolls("RN_GPUI_SCROLL");
    #[cfg(feature = "visual-capture")]
    let scroll_ms = env_u32("RN_GPUI_SCROLL_MS", 1500);
    #[cfg(feature = "visual-capture")]
    let scroll_start_ms = env_u32("RN_GPUI_SCROLL_START_MS", scroll_ms);
    #[cfg(feature = "visual-capture")]
    let keys: Vec<String> = std::env::var("RN_GPUI_KEY")
        .unwrap_or_default()
        .split(';')
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_owned)
        .collect();
    #[cfg(feature = "visual-capture")]
    let key_ms = env_u32("RN_GPUI_KEY_MS", 1500);
    #[cfg(feature = "visual-capture")]
    let mouse_navigation: Vec<String> = std::env::var("RN_GPUI_MOUSE_NAV")
        .unwrap_or_default()
        .split(';')
        .map(str::trim)
        .filter(|direction| matches!(*direction, "back" | "forward"))
        .map(str::to_owned)
        .collect();
    #[cfg(feature = "visual-capture")]
    let mouse_navigation_ms = env_u32("RN_GPUI_MOUSE_NAV_MS", 1500);
    #[cfg(feature = "visual-capture")]
    let screenshot = std::env::var("RN_GPUI_SCREENSHOT").ok();
    #[cfg(feature = "visual-capture")]
    let screenshot_delay_ms = env_u32("RN_GPUI_SCREENSHOT_DELAY_MS", 500);
    // Capture interaction phases in one persistent run: "delay:path;delay:path".
    #[cfg(feature = "visual-capture")]
    let screenshots: Vec<(u32, String)> = std::env::var("RN_GPUI_SCREENSHOTS")
        .unwrap_or_default()
        .split(';')
        .filter_map(|entry| {
            let (delay, path) = entry.split_once(':')?;
            Some((delay.parse().ok()?, path.to_owned()))
        })
        .collect();

    // Metro can supply the initial script without a prebuilt bundle. The
    // host reports a load failure if both Metro and the fallback are absent.

    // C++ (JS/Fabric thread) -> main thread. Installed before any surface
    // starts, otherwise the first mount batch would be dropped.
    let (tx, rx) = async_channel::unbounded::<MainEvent>();
    let mount_tx = tx.clone();
    let _ = rn_gpui_sys::MOUNT_HANDLER.set(Box::new(move |batch: MountBatch| {
        let _ = mount_tx.send_blocking(MainEvent::Mount(batch));
    }));
    let surface_tx = tx.clone();
    let _ = rn_gpui_sys::SURFACE_STOPPED_HANDLER.set(Box::new(move |surface_id: i32| {
        let _ = surface_tx.send_blocking(MainEvent::SurfaceStopped(surface_id));
    }));
    let animated_tx = tx.clone();
    let _ = rn_gpui_sys::ANIMATED_PROPS_HANDLER.set(Box::new(move |props| {
        let _ = animated_tx.send_blocking(MainEvent::AnimatedProps(props));
    }));
    let activity_tx = tx.clone();
    let _ = rn_gpui_sys::ANIMATED_ACTIVE_HANDLER.set(Box::new(move |active| {
        let _ = activity_tx.send_blocking(MainEvent::AnimatedActivity(active));
    }));
    let text_input_command_tx = tx.clone();
    let _ = rn_gpui_sys::TEXT_INPUT_COMMAND_HANDLER.set(Box::new(move |tag, focus| {
        let _ = text_input_command_tx.send_blocking(MainEvent::TextInputCommand { tag, focus });
    }));
    let accessibility_focus_tx = tx.clone();
    let _ = rn_gpui_sys::ACCESSIBILITY_FOCUS_HANDLER.set(Box::new(move |tag| {
        let _ = accessibility_focus_tx.send_blocking(MainEvent::AccessibilityFocus(tag));
    }));
    let text_input_clear_tx = tx.clone();
    let _ = rn_gpui_sys::TEXT_INPUT_CLEAR_HANDLER.set(Box::new(move |tag| {
        let _ = text_input_clear_tx.send_blocking(MainEvent::TextInputClear(tag));
    }));
    let open_url_tx = tx.clone();
    let _ = rn_gpui_sys::OPEN_URL_HANDLER.set(Box::new(move |url| {
        let _ = open_url_tx.send_blocking(MainEvent::OpenUrl(url));
    }));
    let alert_tx = tx.clone();
    let _ = rn_gpui_sys::ALERT_HANDLER.set(Box::new(move |id, title, message, buttons| {
        let _ = alert_tx.send_blocking(MainEvent::AlertRequest {
            id,
            title,
            message,
            buttons,
        });
    }));
    let clipboard_read_tx = tx.clone();
    let _ = rn_gpui_sys::CLIPBOARD_READ_HANDLER.set(Box::new(move |id| {
        let _ = clipboard_read_tx.send_blocking(MainEvent::ClipboardRead(id));
    }));
    let clipboard_write_tx = tx.clone();
    let _ = rn_gpui_sys::CLIPBOARD_WRITE_HANDLER.set(Box::new(move |text| {
        let _ = clipboard_write_tx.send_blocking(MainEvent::ClipboardWrite(text));
    }));

    #[cfg(feature = "visual-capture")]
    let headless = env_bool("RN_GPUI_HEADLESS", false);
    #[cfg(not(feature = "visual-capture"))]
    let headless = false;
    startup_trace(if headless {
        "using GPUI headless platform"
    } else {
        "using GPUI AppKit platform"
    });
    let platform = gpui_platform::current_platform(headless);
    let mut waited_for_display = 0u64;
    while platform.displays().is_empty() {
        if waited_for_display == 0 {
            log::warn!("no active macOS display; waiting before entering AppKit launch");
            startup_trace("waiting for an active display");
        }
        std::thread::sleep(Duration::from_secs(2));
        waited_for_display += 2;
        if waited_for_display % 30 == 0 {
            log::warn!("still waiting for an active macOS display ({waited_for_display}s)");
        }
    }
    startup_trace("active display detected");
    let application = Application::with_platform(platform);
    application
            .with_http_client(std::sync::Arc::new(reqwest_client::ReqwestClient::new()))
        .run(move |cx: &mut App| {
        startup_trace("GPUI application callback entered");
        crate::image_loader::install(cx);
        crate::text::install_fonts(cx);
        // Installed before the host starts a surface: Fabric measures paragraphs
        // from the JS thread and would otherwise fall back to a zero-size stub.
        crate::text::install_measure_handler(cx);
        if let Some(on_app_ready) = config.on_app_ready.take() {
            on_app_ready(cx);
        }

        // The root view is created before the window so the store can register
        // it for surface 1 right away (design doc §18.12: one root per surface).
        // TODO 2.6 — the overlay slot (LogBox) has to exist in the app root's
        // element tree from the first frame too: GPUI only re-renders entities
        // the window tracked while drawing, and the root view itself is not
        // invalidated after that first frame.
        let overlay_host = cx.new(|_| OverlayHost::new());
        let root_view = SurfaceRootView::new(APP_SURFACE_ID).with_overlay_host(overlay_host.clone());
        #[cfg(all(target_os = "macos", feature = "visual-capture"))]
        let root_view = if env_bool("RN_GPUI_NATIVE_WEBVIEW_PROBE", false) {
            root_view.with_native_view_probe(
                crate::native_view_probe::create_webview_probe_entity(cx),
            )
        } else if env_bool("RN_GPUI_NATIVE_COMPOSITION_PROBE", false) {
            root_view.with_native_view_probe(
                crate::native_view_probe::create_probe_entity(cx),
            )
        } else {
            root_view
        };
        let root = cx.new(|_| root_view);
        let restored_bounds = config
            .restore_window_state
            .then(|| load_window_bounds(&window_state_path))
            .flatten();
        startup_trace("window state loaded");
        let bounds = restored_bounds
            .map(|(x, y, width, height)| Bounds::new(point(px(x), px(y)), size(px(width), px(height))))
            .unwrap_or_else(|| {
                let size = size(px(width), px(height));
                if let Some((x, y)) = config.position {
                    Bounds::new(point(px(x), px(y)), size)
                } else {
                    Bounds::centered(None, size, cx)
                }
            });
        #[cfg(feature = "test-driver")]
        let bounds = if env_bool("RN_GPUI_TEST_OFFSCREEN", false) {
            Bounds::new(point(px(-10000.0), px(-10000.0)), bounds.size)
        } else { bounds };
        let (width, height) = restored_bounds.map_or((width, height), |(_, _, width, height)| (width, height));
        if let Some((x, y, restored_width, restored_height)) = restored_bounds {
            log::info!("restoring window at ({x:.0},{y:.0} {restored_width:.0}x{restored_height:.0})");
        }
        startup_trace("opening GPUI window");
        let mut window_options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            ..Default::default()
        };
        #[cfg(feature = "test-driver")]
        if env_bool("RN_GPUI_TEST_OFFSCREEN", false) {
            // AppKit clamps remote coordinates into the visible desktop.
            // Hidden windows still support forced draws and injected input.
            window_options.show = false;
            window_options.focus = false;
        }
        if let Some(configure_window) = config.configure_window.take() {
            configure_window(&mut window_options);
        }
        #[cfg(feature = "visual-capture")]
        if std::env::var_os("RN_GPUI_TRANSPARENT_TITLEBAR").is_some() {
            window_options.titlebar.get_or_insert_with(Default::default).appears_transparent = true;
        }
        let window = cx
            .open_window(
                window_options,
                {
                    let root = root.clone();
                    move |_window, _cx| root.clone()
                },
            )
            .expect("failed to open the GPUI window");
        startup_trace("GPUI window opened");
        let window_id = window.window_id();

        if config.title.is_some() || config.on_window_opened.is_some() {
            let title = config.title.take();
            let on_window_opened = config.on_window_opened.take();
            window
                .update(cx, move |_root, window, cx| {
                    if let Some(title) = title.as_deref() {
                        window.set_window_title(title);
                    }
                    if let Some(on_window_opened) = on_window_opened {
                        on_window_opened(window_id, window, cx);
                    }
                })
                .expect("failed to configure the opened GPUI window");
        }

        // Proves the window really exists: `update` reads the live root view
        // and `bounds()` the OS window's frame.
        let window_bounds = window
            .update(cx, |_root, window, _cx| {
                let bounds = window.bounds();
                (
                    f32::from(bounds.origin.x),
                    f32::from(bounds.origin.y),
                    f32::from(bounds.size.width),
                    f32::from(bounds.size.height),
                )
            })
            .map(|bounds| {
                format!(
                    "({:.0},{:.0} {:.0}x{:.0})",
                    bounds.0, bounds.1, bounds.2, bounds.3
                )
            })
            .unwrap_or_else(|error| format!("<unavailable: {error}>"));
        log::info!("window {window_id:?} open at {window_bounds}");

        // `ViewStore::new` consumes the typed handle; keep the type-erased
        // copy (`AnyWindowHandle` is `Copy`) for the resize hook below.
        #[cfg(any(feature = "visual-capture", feature = "perf-timing"))]
        let any_window = *window;

        // TODO 2.2 — the surface is laid out in DIPs and Fabric rounds to device
        // pixels with this factor, so it has to be the display's real scale:
        // `window.scale_factor()` reads it from the platform window (and is
        // refreshed on every bounds change, which `ViewStore::resize` picks up).
        let window_scale = window
            .update(cx, |_root, window, _cx| window.scale_factor())
            .unwrap_or(2.0);
        let scale = scale_override.unwrap_or(window_scale);

        let host = Host::new(&app_id, &dev_host, dev_port);
        startup_trace("React host created");
        // NativeDeviceInfo is queried during JS module initialization; publish
        // the actual viewport before loading the bundle that imports Dimensions.
        host.set_window_metrics(width, height, scale);
        let top_inset = window.update(cx, |_root, window, _cx| {
            #[cfg(target_os = "macos")]
            { crate::native_view::window_top_inset(window) }
            #[cfg(not(target_os = "macos"))]
            { 0.0 }
        }).unwrap_or(0.0);
        host.set_window_top_inset(top_inset);
        log::info!("[safe-area] native window top inset={top_inset}");
        let appearance = match cx.window_appearance() {
            gpui::WindowAppearance::Dark | gpui::WindowAppearance::VibrantDark => "dark",
            _ => "light",
        };
        host.set_system_appearance(appearance);
        if !host.load_script(&bundle, &source_url) {
            log::error!("load_script failed for {bundle}");
            std::process::exit(1);
        }
        startup_trace("React bundle loaded");
        log::info!("loaded {bundle}");

        host.start_surface(1, &module, width, height, scale);
        startup_trace("React surface started");
        log::info!(
            "started surface 1 ({module}) at {width}x{height}@{scale}x (window scale {window_scale})"
        );

        // TODO 2.3 — tick RN's `EventBeat` once per GPUI frame. The hook is
        // shared with the store (mount batches extend its activity window) and
        // the bounds observer below (resizes are native -> JS work too).
        let frame_hook = crate::frame::FrameHook::new(host.clone());
        window
            .update(cx, |_root, window, _cx| frame_hook.arm(window))
            .expect("failed to arm the per-frame hook");
        let appearance_host = host.clone();
        let appearance_subscription = window
            .update(cx, |_root, window, _cx| {
                window.observe_window_appearance(move |window, _cx| {
                    let appearance = match window.appearance() {
                        gpui::WindowAppearance::Dark | gpui::WindowAppearance::VibrantDark => "dark",
                        _ => "light",
                    };
                    appearance_host.set_system_appearance(appearance);
                })
            })
            .expect("failed to observe window appearance");

        // Kept for the synthetic input loops below: `ViewStore::new` consumes
        // the host handle.
        #[cfg(feature = "visual-capture")]
        let host_for_input = host.clone();
        let store = cx.new(|_| ViewStore::new(host, window, frame_hook.clone(), overlay_host));
        cx.set_global(StoreGlobal(store.clone()));
        #[cfg(feature = "test-driver")]
        if std::env::var("RN_GPUI_TEST_DRIVER").as_deref() == Ok("1") {
            let animations_disabled = std::env::var("RN_GPUI_TEST_DISABLE_ANIMATIONS")
                .map(|value| matches!(value.as_str(), "1" | "true" | "yes"))
                .unwrap_or(false);
            crate::animation_policy::set_animations_disabled(animations_disabled);
            crate::test_driver::start(cx, store.clone(), (*window).into());
        }
        let keyboard_host = store.read(cx).host.clone();
        let keyboard_hook = frame_hook.clone();
        let navigation_keyboard_subscription = cx.intercept_keystrokes(move |event, window, cx| {
            if window.window_handle().window_id() != window_id { return; }
            if let Some(event_name) = crate::input::desktop_navigation_event(&event.keystroke) {
                keyboard_host.emit_device_event(event_name);
                keyboard_hook.arm(window);
                log::info!("[navigation] emitted {event_name} from keyboard");
                cx.stop_propagation();
            }
        });

        store.update(cx, |store, cx| {
            store.register_root(1, root);
            store.top_inset = top_inset;
            store.navigation_keyboard_subscription = Some(navigation_keyboard_subscription);
            store.window_appearance_subscription = Some(appearance_subscription);
            cx.notify();
        });

        // TODO 2.4 — headless input: `RN_GPUI_CLICK` dispatches real mouse
        // events through GPUI's own input path (`Window::dispatch_event`), the
        // same way the accesskit click fallback does. The app runs off-screen in
        // this environment, so this is how the Pressable counter is exercised.
        #[cfg(feature = "visual-capture")]
        if !clicks.is_empty() {
            let host = host_for_input.clone();
            cx.spawn(async move |cx| {
                for (x, y) in clicks {
                    let timer = cx
                        .background_executor()
                        .timer(Duration::from_millis(u64::from(click_ms)));
                    timer.await;
                    let position = gpui::point(px(x), px(y));
                    log::info!("clicking at {x},{y}");
                    let clicked = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            // Draw first so hit testing sees the mounted tree
                            // (see the hover loop below for why).
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            let down = gpui::PlatformInput::MouseDown(gpui::MouseDownEvent {
                                button: gpui::MouseButton::Left,
                                position,
                                ..Default::default()
                            });
                            window.dispatch_event(down, cx);
                        },
                    );
                    if let Err(error) = clicked {
                        log::error!("click at {x},{y} failed: {error}");
                    }
                    if click_hold_ms > 0 {
                        cx.background_executor()
                            .timer(Duration::from_millis(u64::from(click_hold_ms)))
                            .await;
                    }
                    let _ = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            window.dispatch_event(
                                gpui::PlatformInput::MouseUp(gpui::MouseUpEvent {
                                    button: gpui::MouseButton::Left,
                                    position,
                                    ..Default::default()
                                }),
                                cx,
                            );
                        },
                    );
                    if !skip_synthetic_input_flush {
                        flush_js(&host, cx).await;
                    }
                }
            })
            .detach();
        }

        // TODO 7.8 — exercise touch responder negotiation with native mouse
        // input. Each drag is split into several move events so PanResponder's
        // gesture state and move callback see a path outside the origin.
        #[cfg(feature = "visual-capture")]
        if !drags.is_empty() {
            let host = host_for_input.clone();
            let frame_hook = frame_hook.clone();
            cx.spawn(async move |cx| {
                for (index, (start_x, start_y, end_x, end_y, cancel)) in
                    drags.into_iter().enumerate()
                {
                    let delay = if index == 0 { drag_start_ms } else { drag_ms };
                    cx.background_executor()
                        .timer(Duration::from_millis(u64::from(delay)))
                        .await;
                    log::info!("dragging from {start_x},{start_y} to {end_x},{end_y}");
                    let start = gpui::point(px(start_x), px(start_y));
                    let down = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            window.dispatch_event(
                                gpui::PlatformInput::MouseDown(gpui::MouseDownEvent {
                                    button: gpui::MouseButton::Left,
                                    position: start,
                                    ..Default::default()
                                }),
                                cx,
                            );
                        },
                    );
                    if let Err(error) = down {
                        log::error!("drag down failed: {error}");
                        continue;
                    }
                    flush_js(&host, cx).await;

                    for step in 1..=8 {
                        let amount = step as f32 / 8.0;
                        let position = gpui::point(
                            px(start_x + (end_x - start_x) * amount),
                            px(start_y + (end_y - start_y) * amount),
                        );
                        let hook = frame_hook.clone();
                        let moved = cx.update_window(
                            any_window,
                            move |_root: gpui::AnyView,
                                  window: &mut gpui::Window,
                                  cx: &mut App| {
                                let arena_clear_needed = window.draw(cx);
                                arena_clear_needed.clear(cx);
                                window.dispatch_event(
                                    gpui::PlatformInput::MouseMove(gpui::MouseMoveEvent {
                                        position,
                                        pressed_button: Some(gpui::MouseButton::Left),
                                        ..Default::default()
                                    }),
                                    cx,
                                );
                                hook.arm(window);
                            },
                        );
                        if let Err(error) = moved {
                            log::error!("drag move {step} failed: {error}");
                            break;
                        }
                        flush_js(&host, cx).await;
                    }

                    let end = gpui::point(px(end_x), px(end_y));
                    let hook = frame_hook.clone();
                    let released = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            if cancel {
                                crate::events::cancel_active_touch(window, cx, end);
                            }
                            window.dispatch_event(
                                gpui::PlatformInput::MouseUp(gpui::MouseUpEvent {
                                    button: gpui::MouseButton::Left,
                                    position: end,
                                    ..Default::default()
                                }),
                                cx,
                            );
                            hook.arm(window);
                        },
                    );
                    if let Err(error) = released {
                        log::error!("drag release failed: {error}");
                    }
                    flush_js(&host, cx).await;
                }
            })
            .detach();
        }

        // TODO 2.5 — headless hover: `RN_GPUI_HOVER` moves the pointer through
        // the same GPUI input path as a real one (`Window::dispatch_event`), so
        // `pointerEvents`, `cursor` and enter/leave are exercised off-screen.
        #[cfg(feature = "visual-capture")]
        if !hovers.is_empty() {
            let frame_hook = frame_hook.clone();
            let host = host_for_input.clone();
            cx.spawn(async move |cx| {
                for (x, y) in hovers {
                    let timer = cx
                        .background_executor()
                        .timer(Duration::from_millis(u64::from(hover_ms)));
                    timer.await;
                    let position = gpui::point(px(x), px(y));
                    log::info!("hovering at {x},{y}");
                    let hook = frame_hook.clone();
                    let hovered = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            // Hit testing uses the last drawn frame, and this
                            // headless setup cannot rely on the platform asking
                            // for a frame after a mount batch (see
                            // `capture_and_quit`), so draw first: otherwise the
                            // pointer is tested against the empty first frame and
                            // no React mouse listener is ever reached.
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            let input = gpui::PlatformInput::MouseMove(gpui::MouseMoveEvent {
                                position,
                                pressed_button: None,
                                ..Default::default()
                            });
                            window.dispatch_event(input, cx);
                            hook.arm(window);
                        },
                    );
                    if let Err(error) = hovered {
                        log::error!("hover at {x},{y} failed: {error}");
                    }
                    flush_js(&host, cx).await;
                }
            })
            .detach();
        }

        #[cfg(feature = "visual-capture")]
        if !scrolls.is_empty() {
            let frame_hook = frame_hook.clone();
            let host = host_for_input.clone();
            cx.spawn(async move |cx| {
                for (index, (x, y, dx, dy)) in scrolls.into_iter().enumerate() {
                    let delay = if index == 0 { scroll_start_ms } else { scroll_ms };
                    cx.background_executor()
                        .timer(Duration::from_millis(u64::from(delay)))
                        .await;
                    let position = gpui::point(px(x), px(y));
                    log::info!("scrolling at {x},{y} by {dx},{dy}");
                    let hook = frame_hook.clone();
                    let scrolled = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            window.dispatch_event(
                                gpui::PlatformInput::ScrollWheel(gpui::ScrollWheelEvent {
                                    position,
                                    delta: gpui::ScrollDelta::Pixels(gpui::point(px(dx), px(dy))),
                                    ..Default::default()
                                }),
                                cx,
                            );
                            hook.arm(window);
                        },
                    );
                    if let Err(error) = scrolled {
                        log::error!("scroll at {x},{y} failed: {error}");
                    }
                    flush_js(&host, cx).await;
                }
            })
            .detach();
        }

        #[cfg(feature = "visual-capture")]
        if !keys.is_empty() {
            let frame_hook = frame_hook.clone();
            let host = host_for_input.clone();
            cx.spawn(async move |cx| {
                for key in keys {
                    cx.background_executor()
                        .timer(Duration::from_millis(u64::from(key_ms)))
                        .await;
                    let Ok(keystroke) = gpui::Keystroke::parse(&key) else {
                        log::warn!("invalid synthetic keystroke: {key}");
                        continue;
                    };
                    log::info!("pressing key {key}");
                    let hook = frame_hook.clone();
                    let pressed = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            window.dispatch_keystroke(keystroke.clone(), cx);
                            window.dispatch_event(
                                gpui::PlatformInput::KeyUp(gpui::KeyUpEvent { keystroke }),
                                cx,
                            );
                            hook.arm(window);
                        },
                    );
                    if let Err(error) = pressed {
                        log::error!("key {key} failed: {error}");
                    }
                    flush_js(&host, cx).await;
                }
            })
            .detach();
        }

        #[cfg(feature = "visual-capture")]
        if !mouse_navigation.is_empty() {
            let host = host_for_input.clone();
            let frame_hook = frame_hook.clone();
            cx.spawn(async move |cx| {
                for direction in mouse_navigation {
                    cx.background_executor()
                        .timer(Duration::from_millis(u64::from(mouse_navigation_ms)))
                        .await;
                    let button = match direction.as_str() {
                        "back" => gpui::MouseButton::Navigate(gpui::NavigationDirection::Back),
                        _ => gpui::MouseButton::Navigate(gpui::NavigationDirection::Forward),
                    };
                    let hook = frame_hook.clone();
                    let dispatched = cx.update_window(
                        any_window,
                        move |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
                            let arena_clear_needed = window.draw(cx);
                            arena_clear_needed.clear(cx);
                            let position = gpui::point(px(1.), px(1.));
                            window.dispatch_event(
                                gpui::PlatformInput::MouseDown(gpui::MouseDownEvent {
                                    button,
                                    position,
                                    ..Default::default()
                                }),
                                cx,
                            );
                            window.dispatch_event(
                                gpui::PlatformInput::MouseUp(gpui::MouseUpEvent {
                                    button,
                                    position,
                                    ..Default::default()
                                }),
                                cx,
                            );
                            hook.arm(window);
                        },
                    );
                    if let Err(error) = dispatched {
                        log::error!("synthetic mouse navigation {direction} failed: {error}");
                    } else {
                        log::info!("pressed mouse navigation {direction}");
                    }
                    flush_js(&host, cx).await;
                }
            })
            .detach();
        }

        #[cfg(all(target_os = "macos", feature = "visual-capture"))]
        if env_u32("RN_GPUI_TITLEBAR_TOGGLE_MS", 0) > 0 {
            let delay = env_u32("RN_GPUI_TITLEBAR_TOGGLE_MS", 0);
            cx.spawn(async move |cx| {
                for transparent in [false, true] {
                    cx.background_executor().timer(Duration::from_millis(u64::from(delay))).await;
                    let _ = cx.update_window(any_window, move |_, window, cx| {
                        crate::native_view::set_probe_titlebar_transparent(window, transparent);
                        window.bounds_changed(cx);
                        window.refresh();
                        log::info!("[safe-area] probe titlebar transparent={transparent}");
                    });
                }
            }).detach();
        }
        #[cfg(feature = "visual-capture")]
        if env_u32("RN_GPUI_FULLSCREEN_MS", 0) > 0 {
            let delay = env_u32("RN_GPUI_FULLSCREEN_MS", 0);
            cx.spawn(async move |cx| {
                for interval in [delay, 3000] {
                    cx.background_executor().timer(Duration::from_millis(u64::from(interval))).await;
                    let _ = cx.update_window(any_window, |_, window, _| window.toggle_fullscreen());
                }
            }).detach();
        }

        // Window resizes drive Fabric. gpui calls the bounds
        // observers from the platform's `on_resize` hook (the same path a mouse
        // drag takes), and `viewport_size()` is the content area, which is what
        // the React surface covers.
        // The subscription unsubscribes the moment it drops, so it is handed to
        // the store (this closure returns right after setup).
        let last_surface_size = Rc::new(Cell::new((width, height, scale)));
        let bounds_subscription = window
            .update(cx, |_root, window, cx| {
                let store = cx.global::<StoreGlobal>().0.clone();
                let frame_hook = frame_hook.clone();
                let window_state_path = window_state_path.clone();
                let last_surface_size = last_surface_size.clone();
                cx.observe_window_bounds(window, move |_root, window, cx| {
                    let size = window.viewport_size();
                    save_window_bounds(&window_state_path, window.bounds(), size);
                    #[cfg(target_os = "macos")]
                    {
                        let top = crate::native_view::window_top_inset(window);
                        store.update(cx, |store, cx| {
                            if store.top_inset != top {
                                store.top_inset = top;
                                store.host.set_window_top_inset(top);
                                store.frame_hook.arm(window);
                                for node in store.nodes.values() {
                                    if node.read(cx).component == "RNSScreenStackHeaderConfig" {
                                        node.update(cx, |_, cx| cx.notify());
                                    }
                                }
                            }
                        });
                        log::info!("[safe-area] native window top inset={top} fullscreen={}", window.is_fullscreen());
                    }
                    let scale = scale_override.unwrap_or_else(|| window.scale_factor());
                    let (width, height) = (f32::from(size.width), f32::from(size.height));
                    let old = last_surface_size.get();
                    let changed = (old.0 - width).abs() > 0.01
                        || (old.1 - height).abs() > 0.01
                        || (old.2 - scale).abs() > 0.001;
                    if changed {
                        last_surface_size.set((width, height, scale));
                        log::info!("window resized to {width}x{height}@{scale}x");
                        store.update(cx, |store, _cx| store.resize(width, height, scale));
                        // A resize is native -> JS work: keep the per-frame hook
                        // ticking while Fabric re-lays out (TODO 2.3).
                        frame_hook.arm(window);
                    }
                })
            })
            .expect("failed to observe the window's bounds");
        store.update(cx, |store, _cx| {
            store.window_bounds_subscription = Some(bounds_subscription);
        });

        #[cfg(feature = "visual-capture")]
        if resize_ms > 0 {
            let target = size(px(resize_width), px(resize_height));
            let timer = cx
                .background_executor()
                .timer(Duration::from_millis(u64::from(resize_ms)));
            cx.spawn(async move |cx| {
                timer.await;
                log::info!("resizing the window to {resize_width}x{resize_height}");
                let resized = cx.update_window(
                    any_window,
                    move |_root: gpui::AnyView, window: &mut gpui::Window, _cx: &mut App| {
                        window.resize(target)
                    },
                );
                if let Err(error) = resized {
                    log::error!("window resize failed: {error}");
                }
            })
            .detach();
        }

        #[cfg(feature = "visual-capture")]
        if run_ms > 0 {
            let timer = cx
                .background_executor()
                .timer(Duration::from_millis(u64::from(run_ms)));
            cx.spawn(async move |cx| {
                timer.await;
                log::info!("staying alive for {run_ms} ms — closing");
                cx.update(|cx| cx.quit());
            })
            .detach();
        }

        #[cfg(feature = "perf-timing")]
        if benchmark_ms > 0 {
            let timer = cx
                .background_executor()
                .timer(Duration::from_millis(u64::from(benchmark_ms)));
            cx.spawn(async move |cx| {
                timer.await;
                let result = cx.update_window(
                    any_window,
                    move |_root: gpui::AnyView, window: &mut gpui::Window, _cx: &mut App| {
                        let snapshot = window.frame_duration_snapshot();
                        let draw = &snapshot.draw_duration_histogram;
                        let interval = &snapshot.present_interval_histogram;
                        log::info!(
                            "[bench] mode={benchmark_mode} draw_frames={} draw_mean_ms={:.3} draw_p50_ms={:.3} draw_p95_ms={:.3} draw_p99_ms={:.3} draw_max_ms={:.3} present_intervals={} present_mean_ms={:.3} present_p95_ms={:.3}",
                            draw.len(),
                            draw.mean() / 1_000_000.0,
                            draw.value_at_quantile(0.50) as f64 / 1_000_000.0,
                            draw.value_at_quantile(0.95) as f64 / 1_000_000.0,
                            draw.value_at_quantile(0.99) as f64 / 1_000_000.0,
                            draw.max() as f64 / 1_000_000.0,
                            interval.len(),
                            interval.mean() / 1_000_000.0,
                            interval.value_at_quantile(0.95) as f64 / 1_000_000.0,
                        );
                    },
                );
                if let Err(error) = result {
                    log::error!("benchmark snapshot failed: {error}");
                }
            })
            .detach();
        }

        // Drain Fabric mount batches on the main thread and apply them.
        // Capture timers start independently of the mount stream. If RN fails
        // before its first Fabric transaction, the image still distinguishes
        // a blank host from a mounted surface; later captures see resize updates.
        cx.spawn(async move |cx| {
            #[cfg(feature = "visual-capture")]
            for (delay_ms, path) in screenshots {
                let store = store.clone();
                let mut path = Some(path);
                cx.spawn(async move |cx| {
                    capture_and_quit(cx, &store, &mut path, delay_ms).await;
                })
                .detach();
            }
            #[cfg(feature = "visual-capture")]
            if let Some(path) = screenshot {
                let store = store.clone();
                let mut path = Some(path);
                cx.spawn(async move |cx| {
                    capture_and_quit(cx, &store, &mut path, screenshot_delay_ms).await;
                })
                .detach();
            }
            while let Ok(event) = rx.recv().await {
                match event {
                    MainEvent::Mount(batch) => {
                        store.update(cx, |store, cx| store.apply_batch(batch, cx));
                        unsafe { rn_gpui_mount_batch_applied() };
                    }
                    MainEvent::SurfaceStopped(surface_id) => {
                        store.update(cx, |store, cx| store.surface_stopped(surface_id, cx));
                    }
                    MainEvent::AnimatedProps(props) => {
                        if props.has_opacity
                            || props.has_transform
                            || props.reset_transform
                            || props.has_background_color
                            || props.has_text_color
                        {
                            let mut target = None;
                            store.update(cx, |store, _cx| {
                                target = store.nodes.get(&props.tag).cloned();
                            });
                            if let Some(node) = target {
                                node.update(cx, |node, cx| {
                                    if props.has_opacity {
                                        node.set_animated_opacity(props.opacity);
                                    }
                                    if props.has_background_color {
                                        node.set_animated_background_color(props.background_color);
                                    }
                                    if props.has_text_color {
                                        node.set_animated_text_color(props.text_color);
                                    }
                                    if props.has_transform {
                                        node.set_animated_transform(Some(props.transform));
                                    } else if props.reset_transform {
                                        node.set_animated_transform(None);
                                    }
                                    cx.notify();
                                });
                            }
                        }
                    }
                    MainEvent::AnimatedActivity(active) => {
                        let mut target = None;
                        store.update(cx, |store, _cx| {
                            target = Some((store.window, store.frame_hook.clone()));
                        });
                        if let Some((window, frame_hook)) = target {
                            if let Err(error) =
                                cx.update_window(window, move |_root, window, cx| {
                                    frame_hook.set_animation_active(active, window, cx);
                                })
                            {
                                log::error!(
                                    "[native-animated] failed to update GPUI window activity: {error}"
                                );
                            }
                        } else if std::env::var_os("RN_GPUI_DEBUG_ANIMATION").is_some() {
                            log::warn!("[native-animated] animation activity has no window");
                        }
                    }
                    MainEvent::TextInputCommand { tag, focus } => {
                        let target = {
                            let mut target = None;
                            store.update(cx, |store, _cx| {
                                target = store.nodes.get(&tag).cloned().map(|node| (store.window, node));
                            });
                            target
                        };
                        if let Some((window_handle, node)) = target {
                            let _ = cx.update_window(window_handle, move |_root, window, cx| {
                                node.update(cx, |node, cx| {
                                    node.apply_text_input_focus_command(focus, window, cx);
                                });
                            });
                        }
                    }
                    MainEvent::AccessibilityFocus(tag) => {
                        let target = {
                            let mut target = None;
                            store.update(cx, |store, _cx| {
                                target = store
                                    .nodes
                                    .get(&tag)
                                    .cloned()
                                    .map(|node| (store.window, node));
                            });
                            target
                        };
                        if let Some((window_handle, node)) = target {
                            let _ = cx.update_window(window_handle, move |_root, window, cx| {
                                node.update(cx, |node, cx| {
                                    node.focus_for_accessibility(window, cx);
                                });
                            });
                        }
                    }
                    MainEvent::TextInputClear(tag) => {
                        let target = {
                            let mut target = None;
                            store.update(cx, |store, _cx| {
                                target = store.nodes.get(&tag).cloned().map(|node| (store.window, node));
                            });
                            target
                        };
                        if let Some((window_handle, node)) = target {
                            let _ = cx.update_window(window_handle, move |_root, window, cx| {
                                node.update(cx, |node, cx| {
                                    crate::input::clear_text_input(node, window, cx);
                                });
                            });
                        }
                    }
                    MainEvent::OpenUrl(url) => {
                        let _ = cx.update(|cx| cx.open_url(&url));
                    }
                    MainEvent::ClipboardRead(id) => {
                        let mut text = String::new();
                        let _ = cx.update(|cx| {
                            text = cx
                                .read_from_clipboard()
                                .and_then(|item| item.text())
                                .unwrap_or_default();
                        });
                        rn_gpui_sys::ffi::rn_gpui_clipboard_result(id, text);
                    }
                    MainEvent::ClipboardWrite(text) => {
                        let _ = cx.update(|cx| {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(text));
                        });
                    }
                    MainEvent::AlertRequest { id, title, message, buttons } => {
                        let target = {
                            let mut target = None;
                            store.update(cx, |store, _cx| target = Some(store.window));
                            target
                        };
                        if let Some(window) = target {
                            let answers: Vec<gpui::PromptButton> = buttons
                                .iter()
                                .map(|button| gpui::PromptButton::new(button.clone()))
                                .collect();
                            let receiver = cx.update_window(window, move |_root, window, cx| {
                                window.prompt(
                                    gpui::PromptLevel::Info,
                                    &title,
                                    (!message.is_empty()).then_some(message.as_str()),
                                    &answers,
                                    cx,
                                )
                            });
                            if let Ok(receiver) = receiver {
                                cx.spawn(async move |_cx| {
                                    let index = receiver.await.unwrap_or(0) as i32;
                                    rn_gpui_sys::ffi::rn_gpui_alert_result(id, index);
                                })
                                .detach();
                            }
                        }
                    }
                }
            }
            log::info!("mount channel closed");
        })
        .detach();

        cx.activate(true);
        log::info!("waiting for mount batches");
    });
}

/// Render the window's own scene to a PNG and close the app.
///
/// This exists because the §19 "Done when" checks are visual and this
/// environment cannot use `screencapture` (no Screen Recording permission).
/// Rendering the scene off-screen through gpui's own Metal renderer verifies
/// the same paint output without screen access. Requires
/// `--features visual-capture`; see the feature docs in `Cargo.toml`.
#[cfg(feature = "visual-capture")]
async fn capture_and_quit(
    cx: &mut gpui::AsyncApp,
    store: &gpui::Entity<ViewStore>,
    path: &mut Option<String>,
    delay_ms: u32,
) {
    // Give the tree time to settle (mount batches, LogBox surface, reloads).
    let timer = cx
        .background_executor()
        .timer(Duration::from_millis(u64::from(delay_ms)));
    timer.await;

    let Some(path) = path.take() else { return };
    let window = store.read_with(cx, |store, _| store.window);
    let captured = cx.update_window(
        window,
        |_root: gpui::AnyView, window: &mut gpui::Window, cx: &mut App| {
            // `render_to_image` only replays the last drawn scene, and frame
            // demand is unreliable in this headless setup (the platform can go
            // idle after the first frame, after which `FrameHook`'s `armed`
            // latch blocks re-arming). Draw synchronously so the capture always
            // reflects the current element tree.
            let arena_clear_needed = window.draw(cx);
            arena_clear_needed.clear(cx);
            window.render_to_image()
        },
    );
    match captured {
        Ok(Ok(image)) => match image.save(&path) {
            Ok(()) => log::info!("screenshot saved to {path}"),
            Err(error) => log::error!("could not save {path}: {error}"),
        },
        Ok(Err(error)) => log::error!("render_to_image failed: {error}"),
        Err(error) => log::error!("update_window failed: {error}"),
    }
    if env_bool("RN_GPUI_KEEP_ALIVE", false) {
        log::info!("screenshot saved; keeping the GPUI window open");
    } else {
        cx.update(|cx| cx.quit());
    }
}
