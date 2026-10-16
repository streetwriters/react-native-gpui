//! The screens module.
//!
//! Everything react-native-screens needs lives here: its props extraction in
//! `cpp/`, its layout, painting and lifecycle in the modules below. Core is told
//! only what any library can say — a component name, a place to read props from,
//! and a set of generic hooks.

pub mod lifecycle;
pub mod props;
pub mod transition;
pub mod unsupported;

/// Registers this module's renderers and observer.
///
/// Autolink calls this from `ensure_linked()` while `main` starts, before any
/// `gpui::App` exists, so nothing here may touch the app.
pub fn rn_gpui_register() {}
