//! TODO 1.9 — open a GPUI window driven by React Native.
//!
//! Shape follows the design doc §18.10, with the API adjustments the pinned
//! gpui rev needs (`gpui_platform::application()` instead of the doc's
//! `Application::new()`).
//!
//! Environment:
//!   RN_GPUI_APP_ID      app id reported to React (default com.example.rngpui)
//!   RN_GPUI_DEV_HOST    dev server host (default localhost)
//!   RN_GPUI_DEV_PORT    dev server port (default 8081)
//!   RN_GPUI_BUNDLE      path to the JS bundle file
//!   RN_GPUI_SOURCE_URL  source path handed to `ReactHost::loadScript`, i.e. the
//!                       dev server bundle to fetch as
//!                       `http://<host>:<port>/<source path>.bundle?platform=gpui`
//!                       (default index). The prebuilt bundle at RN_GPUI_BUNDLE
//!                       is the fallback when the dev server is unreachable.
//!   RN_GPUI_MODULE      registered component name to start (default App)
//!   RN_GPUI_WIDTH/HEIGHT  surface constraints (default 800/600)
//!   RN_GPUI_SCALE       overrides the display scale handed to Fabric; by
//!                       default the window's `scale_factor()` is used, so a
//!                       Retina display gets `@2x` and a 1x display `@1x`
//!   RN_GPUI_RUN_MS      close the window after N ms; 0 (default) = stay open
//!   RN_GPUI_RESIZE_MS   after N ms resize the window to
//!                       RN_GPUI_RESIZE_WIDTH x RN_GPUI_RESIZE_HEIGHT
//!                       (defaults 1200x400); 0 (default) = never. This is the
//!                       verification hook for TODO 1.12 — it drives the same
//!                       `on_resize` path a mouse drag does.
//!   RN_GPUI_SCREENSHOT  with `--features visual-capture`: render the window's
//!                       scene to this PNG path after the first mount batch,
//!                       then quit (see the feature docs in Cargo.toml)
//!   RN_GPUI_SCREENSHOT_DELAY_MS  how long to wait after that first batch
//!                       before capturing (default 500). Raise it past
//!                       RN_GPUI_RESIZE_MS to capture the resized scene.
//!   RN_GPUI_CLICK       `"x,y;x,y"` synthetic left clicks at window
//!                       coordinates, dispatched as real GPUI mouse events
//!                       (TODO 2.4)
//!   RN_GPUI_CLICK_MS    delay before each click (default 1500)
//!   RN_GPUI_HOVER       `"x,y;x,y"` synthetic pointer moves, dispatched as real
//!                       GPUI mouse-move events (TODO 2.5)
//!   RN_GPUI_HOVER_MS    delay before each move (default 1500)
//!
//! Both synthetic-input knobs force a draw before dispatching (hit testing uses
//! the last drawn frame's hitboxes) and flush RN's queued JS work afterwards
//! (`flush_js`), so a headless run does not depend on the display staying awake
//! to deliver frames.

use gpui::{point, px, size, App, AppContext, Application, Bounds, WindowBounds, WindowOptions};
use rn_gpui::host::Host;
use rn_gpui::store::{OverlayHost, StoreGlobal, SurfaceRootView, ViewStore};
use rn_gpui_sys::ffi::MountBatch;
use std::cell::Cell;
use std::rc::Rc;
use std::time::Duration;

fn env_string(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn startup_trace(stage: &str) {
    if std::env::var_os("RN_GPUI_STARTUP_TRACE").is_some() {
        eprintln!("[rn-gpui startup] {stage}");
    }
}

fn window_state_path(app_id: &str) -> std::path::PathBuf {
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

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes"))
        .unwrap_or(default)
}

fn env_opt_f32(key: &str) -> Option<f32> {
    std::env::var(key).ok().and_then(|value| value.parse().ok())
}

/// `RN_GPUI_CLICK="400,150;400,200"` — synthetic clicks at window coordinates,
/// for the headless "Done when" checks (TODO 2.4: the Pressable counter).
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
    /// A Fabric transaction (TODO 1.6). `apply_batch` mounts it.
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

fn main() {
    startup_trace("main entered");
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    let bundle = env_string("RN_GPUI_BUNDLE", "tester/build/index.gpui.bundle");
    // TODO 2.1: this is the dev server's bundle path, not a URL — the cxx
    // `DevServerHelper` composes `http://<host>:<port>/<source path>.bundle`.
    let source_url = env_string("RN_GPUI_SOURCE_URL", "index");
    let app_id = env_string("RN_GPUI_APP_ID", "com.example.rngpui");
    let dev_host = env_string("RN_GPUI_DEV_HOST", "localhost");
    let dev_port = env_u32("RN_GPUI_DEV_PORT", 8081);
    let module = env_string("RN_GPUI_MODULE", "App");
    let width = env_f32("RN_GPUI_WIDTH", 800.0);
    let height = env_f32("RN_GPUI_HEIGHT", 600.0);
    let window_state_path = window_state_path(&app_id);
    // TODO 2.2: the display scale comes from the window (see below); the env
    // var is an escape hatch for tests on a machine with a different display.
    let scale_override = env_opt_f32("RN_GPUI_SCALE");
    let run_ms = env_u32("RN_GPUI_RUN_MS", 0);
    #[cfg(feature = "perf-timing")]
    let benchmark_ms = env_u32("RN_GPUI_BENCHMARK_MS", 0);
    #[cfg(feature = "perf-timing")]
    let benchmark_mode = env_string("RN_GPUI_BENCH_MODE", "unspecified");
    let resize_ms = env_u32("RN_GPUI_RESIZE_MS", 0);
    let resize_width = env_f32("RN_GPUI_RESIZE_WIDTH", 1200.0);
    let resize_height = env_f32("RN_GPUI_RESIZE_HEIGHT", 400.0);
    // TODO 2.4 — synthetic clicks, spaced `RN_GPUI_CLICK_MS` apart, starting
    // after the first batch is on screen.
    let clicks = env_points("RN_GPUI_CLICK");
    let click_ms = env_u32("RN_GPUI_CLICK_MS", 1500);
    let click_hold_ms = env_u32("RN_GPUI_CLICK_HOLD_MS", 0);
    let skip_synthetic_input_flush = env_bool("RN_GPUI_SKIP_INPUT_FLUSH", false);
    // TODO 2.5 — synthetic hover: `RN_GPUI_HOVER="400,150;400,200"` moves the
    // pointer without holding a button, `RN_GPUI_HOVER_MS` apart.
    let hovers = env_points("RN_GPUI_HOVER");
    let hover_ms = env_u32("RN_GPUI_HOVER_MS", 800);
    let scrolls = env_scrolls("RN_GPUI_SCROLL");
    let scroll_ms = env_u32("RN_GPUI_SCROLL_MS", 1500);
    let scroll_start_ms = env_u32("RN_GPUI_SCROLL_START_MS", scroll_ms);
    let keys: Vec<String> = std::env::var("RN_GPUI_KEY")
        .unwrap_or_default()
        .split(';')
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_owned)
        .collect();
    let key_ms = env_u32("RN_GPUI_KEY_MS", 1500);
    let screenshot = std::env::var("RN_GPUI_SCREENSHOT").ok();
    let screenshot_delay_ms = env_u32("RN_GPUI_SCREENSHOT_DELAY_MS", 500);
    // Capture interaction phases in one persistent run: "delay:path;delay:path".
    let screenshots: Vec<(u32, String)> = std::env::var("RN_GPUI_SCREENSHOTS")
        .unwrap_or_default()
        .split(';')
        .filter_map(|entry| {
            let (delay, path) = entry.split_once(':')?;
            Some((delay.parse().ok()?, path.to_owned()))
        })
        .collect();

    if !std::path::Path::new(&bundle).exists() {
        log::error!("bundle not found: {bundle}");
        std::process::exit(1);
    }

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

    let headless = env_bool("RN_GPUI_HEADLESS", false);
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
        .with_http_client(std::sync::Arc::new(rn_gpui::http_client::GpuiHttpClient::default()))
        .run(move |cx: &mut App| {
        startup_trace("GPUI application callback entered");
        rn_gpui::image_loader::install(cx);
        // Installed before the host starts a surface: Fabric measures paragraphs
        // from the JS thread and would otherwise fall back to a zero-size stub.
        rn_gpui::text::install_measure_handler(cx);

        // The root view is created before the window so the store can register
        // it for surface 1 right away (design doc §18.12: one root per surface).
        // TODO 2.6 — the overlay slot (LogBox) has to exist in the app root's
        // element tree from the first frame too: GPUI only re-renders entities
        // the window tracked while drawing, and the root view itself is not
        // invalidated after that first frame.
        let overlay_host = cx.new(|_| OverlayHost::new());
        let root = cx.new(|_| SurfaceRootView::new(1).with_overlay_host(overlay_host.clone()));
        let restored_bounds = load_window_bounds(&window_state_path);
        startup_trace("window state loaded");
        let bounds = restored_bounds
            .map(|(x, y, width, height)| Bounds::new(point(px(x), px(y)), size(px(width), px(height))))
            .unwrap_or_else(|| Bounds::centered(None, size(px(width), px(height)), cx));
        let (width, height) = restored_bounds.map_or((width, height), |(_, _, width, height)| (width, height));
        if let Some((x, y, restored_width, restored_height)) = restored_bounds {
            log::info!("restoring window at ({x:.0},{y:.0} {restored_width:.0}x{restored_height:.0})");
        }
        startup_trace("opening GPUI window");
        let window = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                },
                {
                    let root = root.clone();
                    move |_window, _cx| root.clone()
                },
            )
            .expect("failed to open the GPUI window");
        startup_trace("GPUI window opened");

        // Proves the window really exists: `update` reads the live root view
        // and `bounds()` the OS window's frame.
        let window_id = window.window_id();
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
        let frame_hook = rn_gpui::frame::FrameHook::new(host.clone());
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
        let host_for_input = host.clone();
        let store = cx.new(|_| ViewStore::new(host, window, frame_hook.clone(), overlay_host));
        cx.set_global(StoreGlobal(store.clone()));
        store.update(cx, |store, cx| {
            store.register_root(1, root);
            store.window_appearance_subscription = Some(appearance_subscription);
            cx.notify();
        });

        // TODO 2.4 — headless input: `RN_GPUI_CLICK` dispatches real mouse
        // events through GPUI's own input path (`Window::dispatch_event`), the
        // same way the accesskit click fallback does. The app runs off-screen in
        // this environment, so this is how the Pressable counter is exercised.
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

        // TODO 2.5 — headless hover: `RN_GPUI_HOVER` moves the pointer through
        // the same GPUI input path as a real one (`Window::dispatch_event`), so
        // `pointerEvents`, `cursor` and enter/leave are exercised off-screen.
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
                            window.dispatch_event(
                                gpui::PlatformInput::KeyDown(gpui::KeyDownEvent {
                                    keystroke: keystroke.clone(),
                                    is_held: false,
                                    prefer_character_input: false,
                                }),
                                cx,
                            );
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

        // TODO 1.12 — window resizes drive Fabric. gpui calls the bounds
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
            for (delay_ms, path) in screenshots {
                let store = store.clone();
                let mut path = Some(path);
                cx.spawn(async move |cx| {
                    capture_and_quit(cx, &store, &mut path, delay_ms).await;
                })
                .detach();
            }
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
                    }
                    MainEvent::SurfaceStopped(surface_id) => {
                        store.update(cx, |store, cx| store.surface_stopped(surface_id, cx));
                    }
                    MainEvent::AnimatedProps(props) => {
                        if props.has_opacity {
                            let mut target = None;
                            store.update(cx, |store, _cx| {
                                target = store.nodes.get(&props.tag).cloned();
                            });
                            if let Some(node) = target {
                                node.update(cx, |node, cx| {
                                    node.set_animated_opacity(props.opacity);
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
                            let _ = cx.update_window(window, move |_root, window, _cx| {
                                frame_hook.set_animation_active(active, window);
                            });
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
                                    rn_gpui::input::clear_text_input(node, window, cx);
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

#[cfg(not(feature = "visual-capture"))]
async fn capture_and_quit(
    _cx: &mut gpui::AsyncApp,
    _store: &gpui::Entity<ViewStore>,
    path: &mut Option<String>,
    _delay_ms: u32,
) {
    if let Some(path) = path.take() {
        log::warn!("RN_GPUI_SCREENSHOT={path} ignored: rebuild with --features visual-capture");
    }
}
