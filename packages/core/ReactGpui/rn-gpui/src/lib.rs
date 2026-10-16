pub(crate) mod accessibility;
pub(crate) mod animation_policy;
pub mod builtins;
pub(crate) mod desktop;
pub(crate) mod events;
pub mod extensions;
pub(crate) mod frame;
pub(crate) mod host;
pub(crate) mod image_loader;
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
/// The runtime a Rust TurboModule is written against.
pub use rn_gpui_module as module;
pub use rn_gpui_module::{register as register_module, ModuleError, ModuleThread, Value};
