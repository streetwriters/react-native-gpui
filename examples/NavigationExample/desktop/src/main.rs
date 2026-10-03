//! Project-owned desktop launch configuration.
//!
//! Add `mod my_turbo_module;` here for local Rust TurboModules. Put matching
//! `Native*.ts` specs beside this file; `run-desktop` discovers and codegens
//! those specs automatically. See `desktop/README.md` for the full example.
//!
//! To manually include one in this app, add e.g.:
//!   mod greeting;
//!   react_native_gpui::register_turbo_module!(greeting::GREETINGMODULE_RN_GPUI_MODULES);

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
    .window_size(1024.0, 768.0)
    // Uncomment to choose a fixed initial top-left location (screen DIPs).
    // .window_position(120.0, 80.0)
    // .restore_window_state(false)
    .configure_window(|options| {
        // GPUI window options are public: titlebar, resizability, display,
        // decorations, min size, and other native window behavior.
        options.is_resizable = true;
    });

    react_native_gpui::run_with(config);
}
