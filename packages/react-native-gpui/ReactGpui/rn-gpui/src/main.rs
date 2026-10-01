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
//!   RN_GPUI_SOURCE_URL  source URL handed to JS (default file://<bundle>)
//!   RN_GPUI_MODULE      registered component name to start (default App)
//!   RN_GPUI_WIDTH/HEIGHT/SCALE  surface constraints (default 800/600/2.0)
//!   RN_GPUI_RUN_MS      close the window after N ms; 0 (default) = stay open

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
    let source_url = std::env::var("RN_GPUI_SOURCE_URL")
        .unwrap_or_else(|_| format!("file://{}", bundle));
    let app_id = env_string("RN_GPUI_APP_ID", "com.example.rngpui");
    let dev_host = env_string("RN_GPUI_DEV_HOST", "localhost");
    let dev_port = env_u32("RN_GPUI_DEV_PORT", 8081);
    let module = env_string("RN_GPUI_MODULE", "App");
    let width = env_f32("RN_GPUI_WIDTH", 800.0);
    let height = env_f32("RN_GPUI_HEIGHT", 600.0);
    let scale = env_f32("RN_GPUI_SCALE", 2.0);
    let run_ms = env_u32("RN_GPUI_RUN_MS", 0);

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
            .map(|bounds| format!("({:.0},{:.0} {:.0}x{:.0})", bounds.0, bounds.1, bounds.2, bounds.3))
            .unwrap_or_else(|error| format!("<unavailable: {error}>"));
        log::info!("window {window_id:?} open at {window_bounds}");

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
        cx.spawn(async move |cx| {
            while let Ok(batch) = rx.recv().await {
                store.update(cx, |store, cx| store.apply_batch(batch, cx));
            }
            log::info!("mount channel closed");
        })
        .detach();

        cx.activate(true);
        log::info!("waiting for mount batches");
    });
}
