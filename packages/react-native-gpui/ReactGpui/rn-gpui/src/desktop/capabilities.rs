//! Platform capability flags (plan §3.4).
//!
//! Apps branch on these instead of try/catching an `unsupported` error. They
//! describe what this OS/session *can* do, not whether a feature is currently
//! active, and they are readable synchronously through
//! `getSnapshot('capabilities')`.
//!
//! These are honest per platform: a flag turns `true` only for a presenter the
//! platform actually implements (see `.local/desktop-shell.md` §1's platform
//! table).

use serde_json::{json, Value};

/// The capability keys the plan defines.
pub const KEYS: [&str; 7] = [
    "nativeAppMenu",
    "nativeContextMenu",
    "tray",
    "trayPopoverAnchored",
    "windowPosition",
    "alwaysOnTop",
    "transparentTitlebar",
];

/// Whether the OS can draw a real application menu bar.
///
/// macOS uses GPUI's `NSMenu`; Windows uses `muda` on the HWND. Linux renders an
/// in-window GPUI bar, which is not a native menu bar.
pub const fn native_app_menu() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

/// Whether context menus are OS-native (`muda`). Linux uses a GPUI popup.
pub const fn native_context_menu() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

/// Whether a status-item/tray icon is available (`tray-icon`, `ksni`).
pub const fn tray() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

/// Whether the tray popover can be anchored under the icon.
///
/// Windows has no anchored popover; Linux depends on the desktop environment
/// (GNOME's AppIndicator gives a menu but no click event).
pub const fn tray_popover_anchored() -> bool {
    cfg!(target_os = "macos")
}

/// Whether the session is a Wayland session. Wayland's protocol has no
/// absolute window positioning and no raise-above, so those calls are
/// `unsupported` there. GPUI picks its backend from the session, so the
/// environment is the honest signal available before a window exists.
pub fn is_wayland() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("WAYLAND_DISPLAY").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Whether a window can be positioned programmatically. Wayland cannot.
pub fn window_position() -> bool {
    !is_wayland()
}

/// Whether a window can be kept above others. Wayland cannot raise windows.
pub fn always_on_top() -> bool {
    !is_wayland()
}

/// Whether the platform can draw a transparent title bar with visible traffic
/// lights/caption buttons.
pub const fn transparent_titlebar() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

/// The capability object handed to JS.
pub fn capabilities() -> Value {
    json!({
        "nativeAppMenu": native_app_menu(),
        "nativeContextMenu": native_context_menu(),
        "tray": tray(),
        "trayPopoverAnchored": tray_popover_anchored(),
        "windowPosition": window_position(),
        "alwaysOnTop": always_on_top(),
        "transparentTitlebar": transparent_titlebar(),
    })
}

/// The snapshot key that returns [`capabilities`].
pub const SNAPSHOT_KEY: &str = "capabilities";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_has_every_documented_key() {
        let value = capabilities();
        let object = value.as_object().expect("capabilities is an object");
        for key in KEYS {
            assert!(object.contains_key(key), "missing capability {key}");
            assert!(
                object[key].is_boolean(),
                "capability {key} must be a boolean"
            );
        }
        assert_eq!(object.len(), KEYS.len());
    }

    #[test]
    fn macos_supports_native_menus_and_anchored_popovers() {
        if cfg!(target_os = "macos") {
            assert!(native_app_menu());
            assert!(native_context_menu());
            assert!(tray());
            assert!(tray_popover_anchored());
            assert!(transparent_titlebar());
        }
    }
}
