mod gpui_first;

fn main() {
    rn_gpui_autolink::ensure_linked();
    // A debug build knows where its own bundle is; a release build does not, and
    // must not: the path would name the machine that built it. A packaged release
    // app resolves the bundle beside its executable instead (see `resources`).
    #[cfg(debug_assertions)]
    if std::env::var_os("RN_GPUI_BUNDLE").is_none() {
        std::env::set_var("RN_GPUI_BUNDLE", env!("RN_GPUI_DEFAULT_BUNDLE"));
    }
    let config = react_native_gpui::DesktopAppConfig::from_env_with_defaults(
        env!("RN_GPUI_APP_NAME"),
        env!("RN_GPUI_APP_ID"),
    )
    .window_title(env!("RN_GPUI_APP_NAME"))
    .window_size(1280.0, 900.0)
    // The tester installs Hermes; with a second engine package present it would
    // otherwise be ambiguous. `RN_GPUI_JS_ENGINE` overrides this.
    .js_engine("hermes")
    .url_schemes(&["rngpuitester"])
    // The e2e suite starts many copies of the tester under one app id, so a
    // second copy must not hand itself to the first unless a test asks.
    .single_instance(std::env::var_os("RN_GPUI_SINGLE_INSTANCE").is_some())
    .configure_window(|options| {
        options.is_resizable = true;
    });

    // No system title bar: the app draws its own (`TitleBar` in App.tsx), so its
    // menu sits where the window chrome would be. On macOS the traffic lights
    // stay and the bar leaves room for them.
    #[cfg(any(windows, target_os = "macos"))]
    let config = config.title_bar(react_native_gpui::WindowTitleBar::Transparent);

    let config = gpui_first::apply(config);

    let config = if std::env::var_os("RN_GPUI_DEMO_WINDOW").is_some() {
        config
            .window_title("React Native GPUI — In motion")
            .window_size(1600.0, 900.0)
            .restore_window_state(false)
            .configure_window(|options| {
                options.titlebar = None;
            })
    } else {
        config
    };

    react_native_gpui::run_with(config);
}
