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
//!   RN_GPUI_WIDTH/HEIGHT/SCALE  surface constraints (default 800/600/2.0)
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

use gpui::{px, size, App, AppContext, Bounds, WindowBounds, WindowOptions};
use rn_gpui::host::Host;
use rn_gpui::store::{StoreGlobal, SurfaceRootView, ViewStore};
use rn_gpui_sys::ffi::MountBatch;
use std::time::Duration;

fn env_string(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
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

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

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
    let scale = env_f32("RN_GPUI_SCALE", 2.0);
    let run_ms = env_u32("RN_GPUI_RUN_MS", 0);
    let resize_ms = env_u32("RN_GPUI_RESIZE_MS", 0);
    let resize_width = env_f32("RN_GPUI_RESIZE_WIDTH", 1200.0);
    let resize_height = env_f32("RN_GPUI_RESIZE_HEIGHT", 400.0);
    let mut screenshot = std::env::var("RN_GPUI_SCREENSHOT").ok();
    let screenshot_delay_ms = env_u32("RN_GPUI_SCREENSHOT_DELAY_MS", 500);

    if !std::path::Path::new(&bundle).exists() {
        log::error!("bundle not found: {bundle}");
        std::process::exit(1);
    }

    // C++ (JS/Fabric thread) -> main thread. Installed before any surface
    // starts, otherwise the first mount batch would be dropped.
    let (tx, rx) = async_channel::unbounded::<MountBatch>();
    let _ = rn_gpui_sys::MOUNT_HANDLER.set(Box::new(move |batch: MountBatch| {
        let _ = tx.send_blocking(batch);
    }));

    gpui_platform::application().run(move |cx: &mut App| {
        // Installed before the host starts a surface: Fabric measures paragraphs
        // from the JS thread and would otherwise fall back to a zero-size stub.
        rn_gpui::text::install_measure_handler(cx);

        // The root view is created before the window so the store can register
        // it for surface 1 right away (design doc §18.12: one root per surface).
        let root = cx.new(|_| SurfaceRootView::new(1));
        let bounds = Bounds::centered(None, size(px(width), px(height)), cx);
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

        let host = Host::new(&app_id, &dev_host, dev_port);
        if !host.load_script(&bundle, &source_url) {
            log::error!("load_script failed for {bundle}");
            std::process::exit(1);
        }
        log::info!("loaded {bundle}");

        host.start_surface(1, &module, width, height, scale);
        log::info!("started surface 1 ({module}) at {width}x{height}@{scale}x");

        let store = cx.new(|_| ViewStore::new(host, window));
        cx.set_global(StoreGlobal(store.clone()));
        store.update(cx, |store, cx| {
            store.register_root(1, root);
            cx.notify();
        });

        // TODO 1.12 — window resizes drive Fabric. gpui calls the bounds
        // observers from the platform's `on_resize` hook (the same path a mouse
        // drag takes), and `viewport_size()` is the content area, which is what
        // the React surface covers.
        // The subscription unsubscribes the moment it drops, so it is handed to
        // the store (this closure returns right after setup).
        let bounds_subscription = window
            .update(cx, |_root, window, cx| {
                let store = cx.global::<StoreGlobal>().0.clone();
                cx.observe_window_bounds(window, move |_root, window, cx| {
                    let size = window.viewport_size();
                    let scale = window.scale_factor();
                    let (width, height) = (f32::from(size.width), f32::from(size.height));
                    log::info!("window resized to {width}x{height}@{scale}x");
                    store.update(cx, |store, _cx| store.resize(width, height, scale));
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

        // Drain Fabric mount batches on the main thread and apply them.
        // The capture is scheduled once but the drain keeps running, so a
        // capture delayed past a resize sees the re-laid-out tree.
        cx.spawn(async move |cx| {
            let mut capture_scheduled = false;
            while let Ok(batch) = rx.recv().await {
                store.update(cx, |store, cx| store.apply_batch(batch, cx));
                if !capture_scheduled && screenshot.is_some() {
                    capture_scheduled = true;
                    let store = store.clone();
                    let mut path = screenshot.take();
                    cx.spawn(async move |cx| {
                        capture_and_quit(cx, &store, &mut path, screenshot_delay_ms).await;
                    })
                    .detach();
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
    // Let gpui draw at least one frame with the new tree before reading back.
    let timer = cx
        .background_executor()
        .timer(Duration::from_millis(u64::from(delay_ms)));
    timer.await;

    let Some(path) = path.take() else { return };
    let window = store.read_with(cx, |store, _| store.window);
    let captured = cx.update_window(
        window,
        |_root: gpui::AnyView, window: &mut gpui::Window, _cx: &mut App| window.render_to_image(),
    );
    match captured {
        Ok(Ok(image)) => match image.save(&path) {
            Ok(()) => log::info!("screenshot saved to {path}"),
            Err(error) => log::error!("could not save {path}: {error}"),
        },
        Ok(Err(error)) => log::error!("render_to_image failed: {error}"),
        Err(error) => log::error!("update_window failed: {error}"),
    }
    cx.update(|cx| cx.quit());
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
