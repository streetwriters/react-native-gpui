use serde_json::{json, Value};

pub const KEYS: [&str; 7] = [
    "nativeAppMenu",
    "nativeContextMenu",
    "tray",
    "trayPopoverAnchored",
    "windowPosition",
    "alwaysOnTop",
    "transparentTitlebar",
];

pub const fn native_app_menu() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

pub const fn native_context_menu() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

pub const fn tray() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

/// Windows has no anchored popover; on Linux it depends on the desktop
/// environment.
pub const fn tray_popover_anchored() -> bool {
    cfg!(target_os = "macos")
}

/// Wayland has no absolute window positioning and no raise-above.
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

pub fn window_position() -> bool {
    !is_wayland()
}

pub fn always_on_top() -> bool {
    !is_wayland()
}

pub const fn transparent_titlebar() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

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
