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

#[cfg(test)]
mod tests {
    use super::*;

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
