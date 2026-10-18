rn_gpui_module::include_specs!();

pub mod alert;
pub mod app_menu;
pub mod clipboard;
pub mod context_menu;
pub mod dev_menu;
pub mod image;
pub mod linking;
pub mod main_thread;
pub mod modal;
pub mod perf_monitor;
pub mod scrollview;
pub mod textinput;
pub mod tray;
pub mod windows;

pub fn register() {
    alert::register();
    app_menu::register();
    clipboard::register();
    context_menu::register();
    dev_menu::register();
    image::register();
    linking::register();
    modal::register();
    perf_monitor::register();
    scrollview::register();
    tray::register();
    windows::register();
}
