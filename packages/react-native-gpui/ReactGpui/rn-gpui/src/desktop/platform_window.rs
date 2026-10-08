//! Window operations GPUI does not expose (plan §8.2).
//!
//! GPUI covers resize, title, minimize, zoom, fullscreen, activation and window
//! dragging. Positioning, always-on-top, a runtime minimum size and explicit
//! show/hide are platform calls, reached through `raw-window-handle`:
//!
//! * macOS: `NSWindow` (`setFrameTopLeftPoint:`, `setLevel:`,
//!   `setContentMinSize:`, `orderFront:`/`orderOut:`, `isMiniaturized`).
//! * Windows: `SetWindowPos` / `ShowWindow` (step 10).
//! * X11: window properties (step 10). Wayland cannot position or raise a
//!   window at all, so those calls stay `unsupported` there.

/// Whether the session can position windows. Wayland cannot.
pub fn supports_position() -> bool {
    crate::desktop::capabilities::window_position()
}

#[cfg(target_os = "macos")]
mod imp {
    use cocoa::base::id;
    use cocoa::foundation::{NSPoint, NSSize};
    use objc::{msg_send, sel, sel_impl};
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    /// `NSFloatingWindowLevel`: above normal windows, below modal panels.
    const FLOATING_WINDOW_LEVEL: i64 = 3;
    /// `NSNormalWindowLevel`.
    const NORMAL_WINDOW_LEVEL: i64 = 0;

    fn ns_window(window: &gpui::Window) -> Result<id, String> {
        let handle = HasWindowHandle::window_handle(window)
            .map_err(|error| format!("no platform window handle: {error}"))?;
        match handle.as_raw() {
            RawWindowHandle::AppKit(appkit) => unsafe {
                let ns_view = appkit.ns_view.as_ptr() as id;
                let native: id = msg_send![ns_view, window];
                if native.is_null() {
                    Err("the AppKit window is gone".to_string())
                } else {
                    Ok(native)
                }
            },
            _ => Err("unexpected platform window handle".to_string()),
        }
    }

    /// Convert a GPUI top-left-origin screen point into an AppKit top-left point.
    ///
    /// GPUI's `bounds()` reports `x - screen.origin.x` and
    /// `screen.height - appkit_y - frame_height + screen.origin.y`; this is the
    /// inverse, so `set_position` round-trips through `window.bounds()`.
    fn appkit_top_left(window: &gpui::Window, native: id, x: f32, y: f32) -> NSPoint {
        unsafe {
            let screen: id = msg_send![native, screen];
            let frame_height = f32::from(window.bounds().size.height);
            if screen.is_null() {
                return NSPoint::new(x as f64, y as f64);
            }
            let screen_frame: cocoa::foundation::NSRect = msg_send![screen, frame];
            let appkit_x = x + screen_frame.origin.x as f32;
            let appkit_y = screen_frame.size.height as f32 - (y - screen_frame.origin.y as f32);
            NSPoint::new(appkit_x as f64, (appkit_y + frame_height) as f64)
        }
    }

    pub fn set_position(window: &mut gpui::Window, x: f32, y: f32) -> Result<(), String> {
        let native = ns_window(window)?;
        let point = appkit_top_left(window, native, x, y);
        unsafe {
            let _: () = msg_send![native, setFrameTopLeftPoint: point];
        }
        Ok(())
    }

    pub fn set_always_on_top(window: &mut gpui::Window, on: bool) -> Result<(), String> {
        let native = ns_window(window)?;
        let level = if on {
            FLOATING_WINDOW_LEVEL
        } else {
            NORMAL_WINDOW_LEVEL
        };
        unsafe {
            let _: () = msg_send![native, setLevel: level];
        }
        Ok(())
    }

    pub fn set_min_size(window: &mut gpui::Window, width: f32, height: f32) -> Result<(), String> {
        let native = ns_window(window)?;
        let size = NSSize::new(width as f64, height as f64);
        unsafe {
            let _: () = msg_send![native, setContentMinSize: size];
        }
        Ok(())
    }

    pub fn set_max_size(window: &mut gpui::Window, width: f32, height: f32) -> Result<(), String> {
        let native = ns_window(window)?;
        let size = NSSize::new(width as f64, height as f64);
        unsafe {
            let _: () = msg_send![native, setContentMaxSize: size];
        }
        Ok(())
    }

    /// `NSWindowStyleMaskResizable`.
    const STYLE_MASK_RESIZABLE: u64 = 1 << 3;

    pub fn set_resizable(window: &mut gpui::Window, resizable: bool) -> Result<(), String> {
        let native = ns_window(window)?;
        unsafe {
            let mask: u64 = msg_send![native, styleMask];
            let next = if resizable {
                mask | STYLE_MASK_RESIZABLE
            } else {
                mask & !STYLE_MASK_RESIZABLE
            };
            if next != mask {
                let _: () = msg_send![native, setStyleMask: next];
            }
        }
        Ok(())
    }

    pub fn show(window: &mut gpui::Window) -> Result<(), String> {
        let native = ns_window(window)?;
        unsafe {
            let _: () = msg_send![native, orderFront: std::ptr::null::<id>()];
        }
        Ok(())
    }

    pub fn hide(window: &mut gpui::Window) -> Result<(), String> {
        let native = ns_window(window)?;
        unsafe {
            let _: () = msg_send![native, orderOut: std::ptr::null::<id>()];
        }
        Ok(())
    }

    pub fn is_minimized(window: &gpui::Window) -> bool {
        let Ok(native) = ns_window(window) else {
            return false;
        };
        unsafe {
            let minimized: bool = msg_send![native, isMiniaturized];
            minimized
        }
    }

    /// `[NSWindow isZoomed]`.
    ///
    /// GPUI's own `Window::is_maximized` reads `NSScreen.visibleFrame` and
    /// panics when the window has no screen (a hidden or off-screen window),
    /// which the test driver creates, so the desktop shell asks AppKit instead.
    pub fn is_maximized(window: &gpui::Window) -> bool {
        let Ok(native) = ns_window(window) else {
            return false;
        };
        unsafe {
            let screen: id = msg_send![native, screen];
            if screen.is_null() {
                return false;
            }
            let zoomed: bool = msg_send![native, isZoomed];
            zoomed
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::*;

#[cfg(not(target_os = "macos"))]
mod imp {
    use gpui::Window;

    const UNSUPPORTED: &str =
        "window positioning and raising are not implemented on this platform yet";

    pub fn set_position(_window: &mut Window, _x: f32, _y: f32) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn set_always_on_top(_window: &mut Window, _on: bool) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn set_min_size(_window: &mut Window, _w: f32, _h: f32) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn set_max_size(_window: &mut Window, _w: f32, _h: f32) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn set_resizable(_window: &mut Window, _resizable: bool) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn show(_window: &mut Window) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn hide(_window: &mut Window) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
    pub fn is_minimized(_window: &Window) -> bool {
        false
    }
    pub fn is_maximized(window: &Window) -> bool {
        window.is_maximized()
    }
}

#[cfg(not(target_os = "macos"))]
pub use imp::*;
