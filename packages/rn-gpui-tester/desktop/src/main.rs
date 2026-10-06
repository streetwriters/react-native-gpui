//! Project-owned desktop launch configuration.
//!
//! Add `mod my_turbo_module;` here for local Rust TurboModules. Put matching
//! `Native*.ts` specs beside this file; `run-desktop` discovers and codegens
//! those specs automatically. The library provides the runtime defaults.
//!
//! To manually include one in this app, add e.g.:
//!   mod greeting;
//!   react_native_gpui::register_turbo_module!(greeting::GREETINGMODULE_RN_GPUI_MODULES);

#[cfg(target_os = "macos")]
struct BlueNativeProbe;

#[cfg(target_os = "macos")]
impl react_native_gpui::native_view::NativeViewFactory for BlueNativeProbe {
    fn create_view(
        &self,
        context: &react_native_gpui::native_view::NativeViewContext,
    ) -> react_native_gpui::native_view::Result<react_native_gpui::native_view::NativeViewHandle>
    {
        use react_native_gpui::native_view::{
            appkit::{
                base::{id, YES},
                foundation::{NSPoint, NSRect, NSSize},
            },
            objective_c::{class, msg_send, sel, sel_impl},
        };

        let frame = NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.));
        unsafe {
            let allocated: id = msg_send![class!(NSView), alloc];
            let view: id = msg_send![allocated, initWithFrame: frame];
            let _: () = msg_send![view, setWantsLayer: YES];
            let layer: id = msg_send![view, layer];
            let color: id = msg_send![
                class!(NSColor),
                colorWithSRGBRed: 0.08
                green: 0.48
                blue: 0.68
                alpha: 1.0
            ];
            let cg_color: id = msg_send![color, CGColor];
            let _: () = msg_send![layer, setBackgroundColor: cg_color];
            let _: () = msg_send![layer, setCornerRadius: 12.0];
            let _: () = msg_send![layer, setMasksToBounds: YES];
            let _ = context.native_props.get("label");
            Ok(react_native_gpui::native_view::NativeViewHandle::from_owned_nsview(view))
        }
    }
}

#[cfg(target_os = "macos")]
struct TesterWebView;

#[cfg(target_os = "macos")]
impl react_native_gpui::native_view::NativeViewFactory for TesterWebView {
    fn create_view(
        &self,
        _context: &react_native_gpui::native_view::NativeViewContext,
    ) -> react_native_gpui::native_view::Result<react_native_gpui::native_view::NativeViewHandle>
    {
        use react_native_gpui::native_view::{
            appkit::{
                base::{id, nil},
                foundation::{NSPoint, NSRect, NSSize, NSString},
            },
            objective_c::{class, msg_send, sel, sel_impl},
        };
        unsafe {
            let allocated: id = msg_send![class!(WKWebView), alloc];
            let view: id = msg_send![allocated, initWithFrame: NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.))];
            let html = NSString::alloc(nil).init_str(
                "<html><body style='background:#153b59;color:white;font:24px system-ui;padding:32px'><h1>WKWebView</h1><p>A native WebKit view hosted inside React Native GPUI.</p></body></html>",
            );
            let _: id = msg_send![view, loadHTMLString: html baseURL: nil];
            let _: () = msg_send![html, release];
            Ok(react_native_gpui::native_view::NativeViewHandle::from_owned_nsview(view))
        }
    }
}

fn main() {
    rn_gpui_autolink::ensure_linked();
    if std::env::var_os("RN_GPUI_BUNDLE").is_none() {
        std::env::set_var("RN_GPUI_BUNDLE", env!("RN_GPUI_DEFAULT_BUNDLE"));
    }
    let config = react_native_gpui::DesktopAppConfig::from_env_with_defaults(
        env!("RN_GPUI_APP_NAME"),
        env!("RN_GPUI_APP_ID"),
    )
    .window_title(env!("RN_GPUI_APP_NAME"))
    .window_size(1280.0, 900.0)
    // Uncomment to choose a fixed initial top-left location (screen DIPs).
    // .window_position(120.0, 80.0)
    // .restore_window_state(false)
    .configure_window(|options| {
        // GPUI window options are public: titlebar, resizability, display,
        // decorations, min size, and other native window behavior.
        options.is_resizable = true;
    })
    .on_app_ready(|_cx| {
        #[cfg(target_os = "macos")]
        react_native_gpui::native_view::register_native_view_factory(
            _cx,
            "BlueNativeProbe",
            BlueNativeProbe,
        );
        #[cfg(target_os = "macos")]
        react_native_gpui::native_view::register_native_view_factory(
            _cx,
            "TesterWebView",
            TesterWebView,
        );
    });

    // Temporary recording demo; ordinary launches retain window persistence.
    let config = if std::env::var_os("RN_GPUI_DEMO_WINDOW").is_some() {
        config
            .window_title("React Native GPUI — In motion")
            .window_size(1600.0, 900.0)
            .restore_window_state(false)
            .configure_window(|options| {
                // Full-size content gives the recording an exact 1600x900 frame.
                options.titlebar = None;
            })
    } else {
        config
    };

    react_native_gpui::run_with(config);
}
