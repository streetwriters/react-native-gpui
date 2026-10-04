//! react-native-gpui core FFI bindings (design doc §18.6).
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
    unsafe extern "C++" {
        include!("GpuiImageLoader.h");
        fn rn_gpui_on_image_load_result(request_id: u64, width: f64, height: f64, error: String);
    }
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

    #[derive(Clone, Debug, Default)]
    pub struct AccessibilityActionFlat {
        pub name: String,
        pub label: String,
    }

    /// Everything the painter needs from BaseViewProps. Colors are 0xAARRGGBB, 0 = none.
    #[derive(Clone, Debug, Default)]
    pub struct ViewPropsFlat {
        pub opacity: f32,
        pub background_color: u32,
        pub border_widths: EdgesF,
        pub content_insets: EdgesF,  // RN layout border + padding insets
        pub border_colors: [u32; 4], // left, top, right, bottom
        pub border_styles: [u8; 4],  // 0 solid, 1 dotted, 2 dashed
        pub border_radii: CornersF,
        pub outline_color: u32,
        pub outline_width: f32,
        pub outline_offset: f32,
        pub outline_style: u8,
        pub overflow_hidden: bool,
        pub display_none: bool, // Fabric layout visibility, including retained descendants
        pub pointer_events: u8, // 0 auto, 1 none, 2 box-none, 3 box-only
        pub cursor: u8,         // RN's `Cursor` ordinal; 0 = auto (TODO 2.5)
        pub shadows: Vec<ShadowF>,
        pub transform: [f32; 16], // column-major 4x4, resolved with layout
        pub has_transform: bool,
        pub test_id: String,
        pub accessibility_label: String,
        pub accessibility_hint: String,
        pub accessibility_language: String,
        pub accessibility_role: String,
        pub accessibility_traits: u32,
        pub accessibility_value_text: String,
        pub accessibility_value_min: i32,
        pub accessibility_value_max: i32,
        pub accessibility_value_now: i32,
        pub accessibility_has_value_min: bool,
        pub accessibility_has_value_max: bool,
        pub accessibility_has_value_now: bool,
        pub accessibility_actions: Vec<AccessibilityActionFlat>,
        pub accessibility_labelled_by: Vec<String>,
        pub accessibility_order: Vec<String>,
        pub accessible: bool,
        pub accessibility_disabled: bool,
        pub accessibility_selected: bool,
        pub accessibility_busy: bool,
        pub accessibility_checked: u8, // 0 absent, 1 unchecked, 2 checked, 3 mixed
        pub accessibility_expanded: i8, // -1 absent, 0 false, 1 true
        pub accessibility_important: u8, // Auto, Yes, No, NoHideDescendants
        pub accessibility_live_region: u8, // None, Polite, Assertive
        pub accessibility_hidden: bool,
        pub accessibility_modal: bool,
        pub accessibility_responds_to_interaction: bool,
        pub accessibility_has_action_listener: bool,
        pub accessibility_has_tap_listener: bool,
        pub accessibility_has_escape_listener: bool,
        pub accessibility_has_magic_tap_listener: bool,
        pub accessibility_native_id: String,
        pub accessibility_ignores_invert_colors: bool,
        pub accessibility_large_content_enabled: bool,
        pub accessibility_large_content_title: String,
        pub focusable: bool,
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
        pub parent_tag: i32,           // Insert/Remove/Update, else -1
        pub index: i32,                // Insert/Remove, else -1
        pub component: String,         // "View", "Paragraph", "Image", "ScrollView", ...
        pub native_view_name: String,  // Registered NativeViewFactory key
        pub native_view_props: String, // JSON object supplied to the native view factory
        pub svg_props_json: String,    // Serialized upstream react-native-svg Fabric props
        pub frame: RectF,              // layoutMetrics.frame, relative to parent, DIPs
        pub props_changed: bool,
        pub view: ViewPropsFlat,
        pub has_paragraph: bool,
        pub paragraph: ParagraphFlat, // filled for "Paragraph" from its state's AttributedString
        pub image_uri: String,        // filled for "Image"
        pub image_resize_mode: u8,    // 0 stretch, 1 contain, 2 cover, 3 center
        pub text_input_text: String,
        pub text_input_placeholder: String,
        pub text_input_selection_color: u32,
        pub text_input_multiline: bool,
        pub text_input_editable: bool,
        pub text_input_secure: bool,
        pub text_input_most_recent_event_count: i32,
        pub text_input_selection_set: bool,
        pub text_input_selection_start: i32,
        pub text_input_selection_end: i32,
        pub modal_visible: bool,
        pub screen_header_title: String,
        pub screen_header_subview_type: String,
        pub screen_header_background_color: u32,
        pub screen_header_title_color: u32,
        pub screen_header_tint_color: u32,
        pub screen_header_hidden: bool,
        pub screen_header_hide_back: bool,
        pub screen_activity_state: f32,
        pub screen_stack_animation: String,
        pub screen_stack_presentation: String,
        pub scroll_x: f32,
        pub scroll_y: f32,
        pub content_width: f32,
        pub content_height: f32,
        pub scroll_horizontal: bool,
        pub scroll_enabled: bool,
        pub layout_changed: bool,
    }

    #[derive(Clone, Debug)]
    pub struct MountBatch {
        pub surface_id: i32,
        pub ops: Vec<MountOp>,
    }

    #[derive(Clone, Copy, Debug, Default)]
    pub struct AnimatedPropsFlat {
        pub tag: i32,
        pub opacity: f32,
        pub has_opacity: bool,
        pub transform: [f32; 16],
        pub has_transform: bool,
        pub reset_transform: bool,
        pub background_color: u32,
        pub has_background_color: bool,
        pub text_color: u32,
        pub has_text_color: bool,
    }

    #[derive(Clone, Copy, Debug, Default)]
    pub struct MeasureResult {
        pub width: f32,
        pub height: f32,
    }

    // ---------- Rust functions callable from C++ ----------
    extern "Rust" {
        fn rn_gpui_load_image(uri: String, request_id: u64);
        fn rn_gpui_image_is_cached(uri: &str) -> bool;
        fn rn_gpui_load_font(family: &str, uri: &str) -> bool;
        fn rn_gpui_render_font_icon(
            family: &str,
            glyph: &str,
            font_size: f64,
            color: u32,
        ) -> String;
        /// Called on the JS/Fabric thread. Must not block, must not touch GPUI.
        fn rn_gpui_on_mount(batch: MountBatch);
        /// Called by RN's synchronous native animated props path.
        fn rn_gpui_on_animated_props(props: AnimatedPropsFlat);
        /// Called by Fabric when RN's TextInput JS wrapper issues focus/blur.
        fn rn_gpui_on_text_input_command(tag: i32, focus: bool);
        fn rn_gpui_request_accessibility_focus(tag: i32);
        /// Called by Fabric when the TextInput ref's clear command is issued.
        fn rn_gpui_on_text_input_clear(tag: i32);
        fn rn_gpui_set_animated_active(active: bool);
        fn rn_gpui_open_url(url: String);
        fn rn_gpui_show_alert(id: i32, title: String, message: String, buttons: Vec<String>);
        fn rn_gpui_read_clipboard(id: i32);
        fn rn_gpui_write_clipboard(text: String);
        /// Called on the JS/Fabric thread during layout. Thread-safe.
        fn rn_gpui_measure_text(
            p: &ParagraphFlat,
            max_width: f32,
            max_height: f32,
        ) -> MeasureResult;
        /// Log output from C++.
        fn rn_gpui_log(level: i32, message: &str);
        /// TODO 2.6 — a surface (or, with `ALL_SURFACES`, the whole React
        /// instance) was torn down. Called on the JS/Fabric thread.
        fn rn_gpui_on_surface_stopped(surface_id: i32);
    }

    // ---------- C++ functions callable from Rust ----------
    unsafe extern "C++" {
        include!("GpuiHost.h");
        type GpuiHost;

        fn new_gpui_host(
            app_id: &str,
            dev_server_host: &str,
            dev_server_port: u32,
        ) -> UniquePtr<GpuiHost>;
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
        fn set_window_top_inset(self: Pin<&mut GpuiHost>, top: f32);
        fn set_window_metrics(self: Pin<&mut GpuiHost>, width: f32, height: f32, scale: f32);
        fn set_system_appearance(self: Pin<&mut GpuiHost>, appearance: &str);
        fn rn_gpui_alert_result(id: i32, button_index: i32);
        fn rn_gpui_clipboard_result(id: i32, text: String);
        fn stop_surface(self: Pin<&mut GpuiHost>, surface_id: i32);
        /// Wake RN's EventBeat after input or a mount batch on the main thread.
        fn on_render(self: &GpuiHost) -> Result<()>;
        /// Animation ticks only from the display-frame hook, never mount batches.
        fn on_frame(self: &GpuiHost, timestamp: f64) -> Result<()>;
        fn on_gesture_frame(self: &GpuiHost, timestamp: f64) -> Result<()>;
        /// payload_json is a JSON object string, e.g. {"pageX":10,"pageY":20}
        fn dispatch_event(self: &GpuiHost, tag: i32, event_type: &str, payload_json: &str);
        fn emit_device_event(self: &GpuiHost, event_name: &str);
        fn emit_device_event_bool(self: &GpuiHost, event_name: &str, value: bool);
        /// Send raw GPUI pointer input to an optional native recognizer before RN touch dispatch.
        fn dispatch_pointer_event(
            self: &GpuiHost,
            target_chain_json: &str,
            x: f32,
            y: f32,
            phase: i32,
            timestamp: f64,
        );
        fn set_scroll_offset(self: &GpuiHost, tag: i32, x: f32, y: f32);
    }
}

use std::sync::OnceLock;

pub use ffi::{
    CornersF, EdgesF, MeasureResult, MountBatch, MountKind, MountOp, ParagraphFlat, RectF, ShadowF,
    TextFragmentFlat, ViewPropsFlat,
};

/// The `rn-gpui` crate installs its handlers here at startup.
pub type MountHandler = Box<dyn Fn(ffi::MountBatch) + Send + Sync>;
pub type MeasureHandler =
    Box<dyn Fn(&ffi::ParagraphFlat, f32, f32) -> ffi::MeasureResult + Send + Sync>;
/// TODO 2.6 — `surface_id`, or [`ALL_SURFACES`] when the whole instance is gone.
pub type SurfaceStoppedHandler = Box<dyn Fn(i32) + Send + Sync>;
pub type AnimatedPropsHandler = Box<dyn Fn(ffi::AnimatedPropsFlat) + Send + Sync>;
pub type AnimatedActiveHandler = Box<dyn Fn(bool) + Send + Sync>;
pub type TextInputCommandHandler = Box<dyn Fn(i32, bool) + Send + Sync>;
pub type TextInputClearHandler = Box<dyn Fn(i32) + Send + Sync>;
pub type AccessibilityFocusHandler = Box<dyn Fn(i32) + Send + Sync>;
pub type OpenUrlHandler = Box<dyn Fn(String) + Send + Sync>;
pub type AlertHandler = Box<dyn Fn(i32, String, String, Vec<String>) + Send + Sync>;
pub static MOUNT_HANDLER: OnceLock<MountHandler> = OnceLock::new();
pub static MEASURE_HANDLER: OnceLock<MeasureHandler> = OnceLock::new();
pub static SURFACE_STOPPED_HANDLER: OnceLock<SurfaceStoppedHandler> = OnceLock::new();
pub static ANIMATED_PROPS_HANDLER: OnceLock<AnimatedPropsHandler> = OnceLock::new();
pub static ANIMATED_ACTIVE_HANDLER: OnceLock<AnimatedActiveHandler> = OnceLock::new();
pub static TEXT_INPUT_COMMAND_HANDLER: OnceLock<TextInputCommandHandler> = OnceLock::new();
pub static TEXT_INPUT_CLEAR_HANDLER: OnceLock<TextInputClearHandler> = OnceLock::new();
pub static ACCESSIBILITY_FOCUS_HANDLER: OnceLock<AccessibilityFocusHandler> = OnceLock::new();
pub static OPEN_URL_HANDLER: OnceLock<OpenUrlHandler> = OnceLock::new();
pub static ALERT_HANDLER: OnceLock<AlertHandler> = OnceLock::new();
pub type ClipboardReadHandler = Box<dyn Fn(i32) + Send + Sync>;
pub type ClipboardWriteHandler = Box<dyn Fn(String) + Send + Sync>;
pub static CLIPBOARD_READ_HANDLER: OnceLock<ClipboardReadHandler> = OnceLock::new();
pub static CLIPBOARD_WRITE_HANDLER: OnceLock<ClipboardWriteHandler> = OnceLock::new();
pub type ImageHandler = Box<dyn Fn(String, u64) + Send + Sync>;
pub static IMAGE_HANDLER: OnceLock<ImageHandler> = OnceLock::new();
pub type ImageCacheQueryHandler = Box<dyn Fn(&str) -> bool + Send + Sync>;
pub static IMAGE_CACHE_QUERY_HANDLER: OnceLock<ImageCacheQueryHandler> = OnceLock::new();
pub type FontLoadHandler = Box<dyn Fn(&str, &str) -> bool + Send + Sync>;
pub type FontIconHandler = Box<dyn Fn(&str, &str, f64, u32) -> String + Send + Sync>;
pub static FONT_LOAD_HANDLER: OnceLock<FontLoadHandler> = OnceLock::new();
pub static FONT_ICON_HANDLER: OnceLock<FontIconHandler> = OnceLock::new();

fn rn_gpui_load_font(family: &str, uri: &str) -> bool {
    FONT_LOAD_HANDLER
        .get()
        .is_some_and(|handler| handler(family, uri))
}

fn rn_gpui_render_font_icon(family: &str, glyph: &str, font_size: f64, color: u32) -> String {
    FONT_ICON_HANDLER.get().map_or_else(String::new, |handler| {
        handler(family, glyph, font_size, color)
    })
}

fn rn_gpui_load_image(uri: String, request_id: u64) {
    if let Some(handler) = IMAGE_HANDLER.get() {
        handler(uri, request_id);
    } else {
        ffi::rn_gpui_on_image_load_result(
            request_id,
            0.0,
            0.0,
            "image loader is not initialized".into(),
        );
    }
}

fn rn_gpui_image_is_cached(uri: &str) -> bool {
    IMAGE_CACHE_QUERY_HANDLER
        .get()
        .map(|handler| handler(uri))
        .unwrap_or(false)
}

/// Sentinel surface id meaning "every surface": C++ passes it when React tears
/// the whole instance down (a reload), which is when the platform has to forget
/// every tree at once. Mirror of `rngpui::kAllSurfacesStopped` in `GpuiHost.h`.
pub const ALL_SURFACES: i32 = -1;

/// TODO 2.6 — called by C++ when a surface (or the whole instance) is torn
/// down. Fabric emits no Delete mutations for a dying surface, so this is the
/// only cleanup signal the view store gets.
fn rn_gpui_on_surface_stopped(surface_id: i32) {
    match SURFACE_STOPPED_HANDLER.get() {
        Some(handler) => handler(surface_id),
        None => log::debug!(
            "rn_gpui_on_surface_stopped({surface_id}): no handler registered yet — dropped"
        ),
    }
}

/// Called by the C++ mounting manager on the Fabric thread. Queues the batch
/// for the GPUI main thread and returns at once, so mounting never blocks on
/// rendering. Dropped (with a warning) if no handler is registered yet.
fn rn_gpui_on_mount(batch: ffi::MountBatch) {
    match MOUNT_HANDLER.get() {
        Some(handler) => handler(batch),
        None => {
            // Bootstrap has not registered the GPUI mount handler yet; log and drop.
            log::debug!(
                "rn_gpui_on_mount: dropping batch for surface {} ({} ops) — no handler registered",
                batch.surface_id,
                batch.ops.len()
            );
        }
    }
}

fn rn_gpui_on_animated_props(props: ffi::AnimatedPropsFlat) {
    if let Some(handler) = ANIMATED_PROPS_HANDLER.get() {
        handler(props);
    }
}

fn rn_gpui_set_animated_active(active: bool) {
    if let Some(handler) = ANIMATED_ACTIVE_HANDLER.get() {
        handler(active);
    }
}

fn rn_gpui_on_text_input_command(tag: i32, focus: bool) {
    if let Some(handler) = TEXT_INPUT_COMMAND_HANDLER.get() {
        handler(tag, focus);
    }
}

fn rn_gpui_on_text_input_clear(tag: i32) {
    if let Some(handler) = TEXT_INPUT_CLEAR_HANDLER.get() {
        handler(tag);
    }
}

fn rn_gpui_request_accessibility_focus(tag: i32) {
    if let Some(handler) = ACCESSIBILITY_FOCUS_HANDLER.get() {
        handler(tag);
    }
}

fn rn_gpui_open_url(url: String) {
    if let Some(handler) = OPEN_URL_HANDLER.get() {
        handler(url);
    }
}

fn rn_gpui_show_alert(id: i32, title: String, message: String, buttons: Vec<String>) {
    if let Some(handler) = ALERT_HANDLER.get() {
        handler(id, title, message, buttons);
    }
}

fn rn_gpui_read_clipboard(id: i32) {
    if let Some(handler) = CLIPBOARD_READ_HANDLER.get() {
        handler(id);
    }
}

fn rn_gpui_write_clipboard(text: String) {
    if let Some(handler) = CLIPBOARD_WRITE_HANDLER.get() {
        handler(text);
    }
}

fn rn_gpui_measure_text(
    p: &ffi::ParagraphFlat,
    max_width: f32,
    max_height: f32,
) -> ffi::MeasureResult {
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
