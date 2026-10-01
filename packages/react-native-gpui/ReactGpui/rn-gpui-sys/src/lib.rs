//! react-native-gpui core FFI bindings (design doc §18.6, TODO 1.6).
//!
//! One cxx bridge, two directions:
//!  * `extern "Rust"` — the C++ platform glue hands mount batches and text
//!    measurement requests to Rust.
//!  * `unsafe extern "C++"` — Rust drives the React host through `GpuiHost`.
//!
//! Everything crossing the boundary is flat (no smart pointers, no `folly`,
//! no GPUI types): `rn-gpui` registers handlers through the `OnceLock`s below
//! and never has to know about React.

#[cxx::bridge(namespace = "rngpui")]
pub mod ffi {
    // ---------- shared, flat data ----------

    #[derive(Clone, Copy, Debug, Default)]
    pub struct RectF {
        pub x: f32,
        pub y: f32,
        pub w: f32,
        pub h: f32,
    }

    #[derive(Clone, Copy, Debug, Default)]
    pub struct EdgesF {
        pub left: f32,
        pub top: f32,
        pub right: f32,
        pub bottom: f32,
    }

    #[derive(Clone, Copy, Debug, Default)]
    pub struct CornersF {
        pub tl: f32,
        pub tr: f32,
        pub br: f32,
        pub bl: f32,
    }

    #[derive(Clone, Debug, Default)]
    pub struct ShadowF {
        pub dx: f32,
        pub dy: f32,
        pub blur: f32,
        pub spread: f32,
        pub color: u32,
        pub inset: bool,
    }

    /// Everything the painter needs from BaseViewProps. Colors are 0xAARRGGBB, 0 = none.
    #[derive(Clone, Debug, Default)]
    pub struct ViewPropsFlat {
        pub opacity: f32,
        pub background_color: u32,
        pub border_widths: EdgesF,
        pub border_colors: [u32; 4], // left, top, right, bottom
        pub border_radii: CornersF,
        pub overflow_hidden: bool,
        pub pointer_events: u8, // 0 auto, 1 none, 2 box-none, 3 box-only
        pub shadows: Vec<ShadowF>,
        pub transform: [f32; 16], // column-major 4x4, resolved with layout
        pub has_transform: bool,
        pub test_id: String,
        pub accessibility_label: String,
        pub accessibility_role: String,
    }

    #[derive(Clone, Debug, Default)]
    pub struct TextFragmentFlat {
        pub text: String,
        pub font_family: String,
        pub font_size: f32,
        pub font_weight: u16, // 100..900
        pub italic: bool,
        pub color: u32,
        pub line_height: f32, // 0 = default
        pub letter_spacing: f32,
        pub underline: bool,
        pub strikethrough: bool,
    }

    #[derive(Clone, Debug, Default)]
    pub struct ParagraphFlat {
        pub fragments: Vec<TextFragmentFlat>,
        pub max_lines: i32, // 0 = unlimited
        pub text_align: u8, // 0 natural, 1 left, 2 center, 3 right, 4 justify, 5 start, 6 end
        pub ellipsize: u8,  // 0 tail, 1 head, 2 middle, 3 clip
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    #[repr(u8)]
    pub enum MountKind {
        Create = 1,
        Delete = 2,
        Insert = 4,
        Remove = 8,
        Update = 16,
    }

    #[derive(Clone, Debug)]
    pub struct MountOp {
        pub kind: MountKind,
        pub tag: i32,
        pub parent_tag: i32, // Insert/Remove/Update, else -1
        pub index: i32,      // Insert/Remove, else -1
        pub component: String, // "View", "Paragraph", "Image", "ScrollView", ...
        pub frame: RectF,    // layoutMetrics.frame, relative to parent, DIPs
        pub props_changed: bool,
        pub view: ViewPropsFlat,
        pub has_paragraph: bool,
        pub paragraph: ParagraphFlat, // filled for "Paragraph" from its state's AttributedString
        pub image_uri: String,        // filled for "Image"
    }

    #[derive(Clone, Debug)]
    pub struct MountBatch {
        pub surface_id: i32,
        pub ops: Vec<MountOp>,
    }

    #[derive(Clone, Copy, Debug, Default)]
    pub struct MeasureResult {
        pub width: f32,
        pub height: f32,
    }

    // ---------- Rust functions callable from C++ ----------
    extern "Rust" {
        /// Called on the JS/Fabric thread. Must not block, must not touch GPUI.
        fn rn_gpui_on_mount(batch: MountBatch);
        /// Called on the JS/Fabric thread during layout. Thread-safe.
        fn rn_gpui_measure_text(p: &ParagraphFlat, max_width: f32, max_height: f32) -> MeasureResult;
        /// Log output from C++.
        fn rn_gpui_log(level: i32, message: &str);
    }

    // ---------- C++ functions callable from Rust ----------
    unsafe extern "C++" {
        include!("GpuiHost.h");
        type GpuiHost;

        fn new_gpui_host(app_id: &str, dev_server_host: &str, dev_server_port: u32) -> UniquePtr<GpuiHost>;
        fn load_script(self: Pin<&mut GpuiHost>, bundle_path: &str, source_url: &str) -> bool;
        fn start_surface(
            self: Pin<&mut GpuiHost>,
            surface_id: i32,
            module_name: &str,
            width: f32,
            height: f32,
            scale: f32,
        );
        fn set_surface_size(
            self: Pin<&mut GpuiHost>,
            surface_id: i32,
            width: f32,
            height: f32,
            scale: f32,
        );
        fn stop_surface(self: Pin<&mut GpuiHost>, surface_id: i32);
        /// Call once per GPUI frame on the main thread (drives RN's EventBeat).
        fn on_render(self: &GpuiHost);
        /// payload_json is a JSON object string, e.g. {"pageX":10,"pageY":20}
        fn dispatch_event(self: &GpuiHost, tag: i32, event_type: &str, payload_json: &str);
        fn reload(self: Pin<&mut GpuiHost>);
    }
}

use std::sync::OnceLock;

pub use ffi::{
    CornersF, EdgesF, MeasureResult, MountBatch, MountKind, MountOp, ParagraphFlat, RectF, ShadowF,
    TextFragmentFlat, ViewPropsFlat,
};

/// The `rn-gpui` crate installs its handlers here at startup.
pub type MountHandler = Box<dyn Fn(ffi::MountBatch) + Send + Sync>;
pub type MeasureHandler = Box<dyn Fn(&ffi::ParagraphFlat, f32, f32) -> ffi::MeasureResult + Send + Sync>;
pub static MOUNT_HANDLER: OnceLock<MountHandler> = OnceLock::new();
pub static MEASURE_HANDLER: OnceLock<MeasureHandler> = OnceLock::new();

/// Called by the C++ mounting manager on the Fabric thread. Queues the batch
/// for the GPUI main thread and returns at once, so mounting never blocks on
/// rendering. Dropped (with a warning) if no handler is registered yet.
fn rn_gpui_on_mount(batch: ffi::MountBatch) {
    match MOUNT_HANDLER.get() {
        Some(handler) => handler(batch),
        None => {
            // No handler yet (TODO 1.6-1.9 window): log and drop.
            log::debug!(
                "rn_gpui_on_mount: dropping batch for surface {} ({} ops) — no handler registered",
                batch.surface_id,
                batch.ops.len()
            );
        }
    }
}

fn rn_gpui_measure_text(p: &ffi::ParagraphFlat, max_width: f32, max_height: f32) -> ffi::MeasureResult {
    match MEASURE_HANDLER.get() {
        Some(handler) => handler(p, max_width, max_height),
        None => ffi::MeasureResult::default(),
    }
}

fn rn_gpui_log(level: i32, message: &str) {
    match level {
        0 => log::debug!("{message}"),
        1 => log::info!("{message}"),
        2 => log::warn!("{message}"),
        _ => log::error!("{message}"),
    }
}

// The C++ GpuiHost is created, driven and dropped from the GPUI main thread;
// the wrapper is moved to Rust, so cxx needs these to be declared explicitly.
unsafe impl Send for ffi::GpuiHost {}
unsafe impl Sync for ffi::GpuiHost {}
