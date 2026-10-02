//! react-native-gpui: GPUI-backed React Native runtime.
//!
//! `run` boots the shared platform runtime; per-app launch logic lives under
//! the consuming app's `desktop/src/`.

pub mod autolink;
pub mod events;
pub mod frame;
pub mod host;
pub mod http_client;
pub mod image_loader;
pub mod input;
#[cfg(target_os = "macos")]
pub mod native_view_probe;
pub mod node_view;
pub mod sample_turbo_module;
pub mod store;
pub mod style;
pub mod text;

mod bootstrap;
pub use bootstrap::{run, run_with, DesktopAppConfig};
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
