//! TODO 1.7 — headless `rn-gpui` binary.
//!
//! Creates the React host, loads a **file** bundle and starts one surface.
//! There is no GPUI window yet (that is TODO 1.9), so this binary exists to
//! prove the whole native path works: Hermes evaluates the bundle, `console.log`
//! reaches `rn_gpui_log`, and Fabric mounts into `GpuiMountingManager`.
//!
//! Environment:
//!   RN_GPUI_APP_ID      app id reported to React (default com.example.rngpui)
//!   RN_GPUI_DEV_HOST    dev server host (default localhost)
//!   RN_GPUI_DEV_PORT    dev server port (default 8081)
//!   RN_GPUI_BUNDLE      path to the JS bundle file
//!   RN_GPUI_SOURCE_URL  source URL handed to JS (default file://<bundle>)
//!   RN_GPUI_MODULE      registered component name to start (default App)
//!   RN_GPUI_WIDTH/HEIGHT/SCALE  surface constraints (default 800/600/2.0)
//!   RN_GPUI_RUN_MS      how long to stay alive; 0 (default) = until killed

use rn_gpui::host::Host;
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

    // C++ (JS/Fabric thread) -> Rust. TODO 1.8 prints every operation; until
    // then just count them so a batch is visible proof the path works.
    let _ = rn_gpui_sys::MOUNT_HANDLER.set(Box::new(|batch: MountBatch| {
        log::info!(
            "[mount] surface {}: {} ops (per-op printing lands in TODO 1.8)",
            batch.surface_id,
            batch.ops.len()
        );
    }));

    let bundle = env_string("RN_GPUI_BUNDLE", "tester/build/index.gpui.bundle");
    let source_url = std::env::var("RN_GPUI_SOURCE_URL")
        .unwrap_or_else(|_| format!("file://{}", bundle));
    let module = env_string("RN_GPUI_MODULE", "App");
    let width = env_f32("RN_GPUI_WIDTH", 800.0);
    let height = env_f32("RN_GPUI_HEIGHT", 600.0);
    let scale = env_f32("RN_GPUI_SCALE", 2.0);

    if !std::path::Path::new(&bundle).exists() {
        log::error!("bundle not found: {bundle}");
        std::process::exit(1);
    }

    let host = Host::new(
        &env_string("RN_GPUI_APP_ID", "com.example.rngpui"),
        &env_string("RN_GPUI_DEV_HOST", "localhost"),
        env_u32("RN_GPUI_DEV_PORT", 8081),
    );

    if !host.load_script(&bundle, &source_url) {
        log::error!("load_script failed for {bundle}");
        std::process::exit(1);
    }
    log::info!("loaded {bundle}");

    host.start_surface(1, &module, width, height, scale);
    log::info!("started surface 1 ({module}) at {width}x{height}@{scale}x");

    let run_ms = env_u32("RN_GPUI_RUN_MS", 0);
    if run_ms == 0 {
        log::info!("running until killed");
        loop {
            std::thread::park();
        }
    }
    log::info!("staying alive for {run_ms} ms");
    std::thread::sleep(Duration::from_millis(u64::from(run_ms)));
    log::info!("done");
}
