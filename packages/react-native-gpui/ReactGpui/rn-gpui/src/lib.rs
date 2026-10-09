pub(crate) mod accessibility;
pub(crate) mod animation_policy;
pub(crate) mod desktop;
pub(crate) mod events;
pub(crate) mod frame;
pub(crate) mod host;
pub(crate) mod image_loader;
pub(crate) mod input;
#[cfg(target_os = "macos")]
pub mod native_view;
#[cfg(all(target_os = "macos", feature = "visual-capture"))]
pub(crate) mod native_view_probe;
pub(crate) mod node_view;
pub(crate) mod pointer_area;
pub(crate) mod scroll_indicator;
pub(crate) mod store;
pub(crate) mod style;
#[cfg(feature = "test-driver")]
mod test_driver;
pub(crate) mod text;

mod bootstrap;
pub use bootstrap::{run, run_with, DesktopAppConfig};
pub use desktop::tray::TrayConfig;
pub use rn_gpui_macros::rn_module;

/// Keep a locally declared `#[rn_module]`'s exported C ABI symbols linked into
/// the desktop executable so the generated C++ TurboModule provider can call
/// them. Pass the generated `*_RN_GPUI_MODULES` constant from the module.
#[macro_export]
macro_rules! register_turbo_module {
    ($modules:path) => {
        const _: () = {
            #[used]
            static MODULES: &[&str] = $modules;
        };
    };
}
