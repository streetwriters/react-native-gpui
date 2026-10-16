//! The built-in platform services and components.
//!
//! Each is a module like any crate's: it registers a component renderer or a
//! Rust TurboModule through the public extension API. They live in core because
//! the platform is responsible for them, not because they are special — an
//! uninstalled optional package and an absent built-in are treated the same way
//! by the registries.
//!
//! The specs are generated together by `build.rs`, so `rn_gpui_specs` is one
//! module that every built-in service shares.

rn_gpui_module::include_specs!();

pub mod alert;
pub mod clipboard;
pub mod image;
pub mod linking;
pub mod main_thread;
pub mod modal;
pub mod scrollview;
pub mod textinput;

/// Registers every built-in the platform is responsible for.
pub fn register() {
    alert::register();
    clipboard::register();
    image::register();
    linking::register();
    modal::register();
    scrollview::register();
}
