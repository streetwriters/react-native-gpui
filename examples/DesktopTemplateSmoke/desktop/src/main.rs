//! Project-owned desktop launch configuration.
//!
//! Add `mod my_turbo_module;` here for local Rust TurboModules. Put matching
//! `Native*.d.ts` specs beside this file; `run-desktop` discovers and codegens
//! those specs automatically. See `desktop/README.md` for the full example.
//!
//! To manually include one in this app, add e.g.:
//!   mod greeting;
//!   react_native_gpui::register_turbo_module!(greeting::GREETINGMODULE_RN_GPUI_MODULES);

fn main() {
    rn_gpui_autolink::ensure_linked();
    let config = react_native_gpui::DesktopAppConfig::from_env()
        .window_title("My React Native App")
        .window_size(1024.0, 768.0)
        // Uncomment to choose a fixed initial top-left location (screen DIPs).
        // .window_position(120.0, 80.0)
        // .restore_window_state(false)
        .configure_window(|options| {
            // GPUI window options are public: titlebar, resizability, display,
            // decorations, min size, and other native window behavior.
            options.is_resizable = true;
        })
        .on_window_opened(|_window_id, window, _cx| {
            // Use the underlying live GPUI window directly when needed.
            window.set_window_title("My React Native App");
        });

    react_native_gpui::run_with(config);
}
