//! The proof module for Phase C: a component renderer and a probe, built only
//! from the public extension API.
//!
//! Nothing here is imported by core. The crate is linked because autolink saw
//! `platforms.gpui.crate`, and its `rn_gpui_register` publishes a renderer for
//! `FixtureBadge` and the `FixtureBadgeProbe` TurboModule. Core learns nothing
//! about the badge: it consults the registry by component name and falls
//! through to its own painting when no module registered it.

rn_gpui_module::include_specs!();

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use gpui::{div, prelude::*, px, rgb, AnyElement, App, Window};
use react_native_gpui::extensions::{
    register_component_renderer, ComponentNode, ComponentRenderer,
};
use rn_gpui_module::{ModuleError, ModuleThread};

/// Frames the frame callback has seen, and renders the renderer has done. Both
/// are read back through the probe so a test can assert the module is live
/// without inspecting pixels.
static FRAME_TICKS: AtomicU64 = AtomicU64::new(0);
static PROP_READS: AtomicU64 = AtomicU64::new(0);

/// Called by this module's C++ half, which owns the `registerFrameCallback`
/// registration. A frame callback is a C++ API; Rust only counts.
#[no_mangle]
pub extern "C" fn rn_gpui_fixture_badge_frame(_timestamp_ms: f64) {
    FRAME_TICKS.fetch_add(1, Ordering::Relaxed);
}

struct FixtureBadgeRenderer;

impl ComponentRenderer for FixtureBadgeRenderer {
    fn render(
        &self,
        node: &ComponentNode,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Option<AnyElement> {
        PROP_READS.fetch_add(1, Ordering::Relaxed);
        let label = node
            .props
            .get("label")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("FixtureBadge");
        let ticks = node
            .props
            .get("tickCount")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0);
        Some(
            div()
                .size_full()
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(0x1d4ed8))
                .text_color(rgb(0xffffff))
                .text_size(px(18.0))
                .child(format!("{label} · frame {ticks}"))
                .into_any_element(),
        )
    }
}

struct FixtureBadgeProbe;

impl NativeFixtureBadgeProbeSpec for FixtureBadgeProbe {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeFixtureBadgeProbeEvents) -> Self {
        Self
    }

    fn frame_ticks(&self) -> Result<f64, ModuleError> {
        Ok(FRAME_TICKS.load(Ordering::Relaxed) as f64)
    }

    fn prop_reads(&self) -> Result<f64, ModuleError> {
        Ok(PROP_READS.load(Ordering::Relaxed) as f64)
    }
}

/// Called by the app's autolink shim, which keeps this crate linked in.
pub fn rn_gpui_register() {
    register_component_renderer("FixtureBadge", Arc::new(FixtureBadgeRenderer));
    rn_gpui_module::register(native_fixture_badge_probe_module::<FixtureBadgeProbe>());
}
