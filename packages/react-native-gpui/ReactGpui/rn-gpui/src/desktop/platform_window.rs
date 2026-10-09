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

/// Windows: `SetWindowPos` / `ShowWindow` / `IsIconic` / `IsZoomed` on the
/// HWND (plan step 10).
///
/// **Written but never compiled**: this machine cannot build for Windows, so
/// treat it as unverified until a Windows run proves it (plan §12.1).
#[cfg(target_os = "windows")]
mod imp {
    use gpui::Window;
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        IsIconic, IsZoomed, SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOW,
    };

    const UNSUPPORTED_MIN_MAX: &str =
        "a runtime minimum/maximum size needs a WM_GETMINMAXINFO handler in GPUI's window procedure";

    fn hwnd(window: &Window) -> Result<HWND, String> {
        let handle = HasWindowHandle::window_handle(window)
            .map_err(|error| format!("no platform window handle: {error}"))?;
        match handle.as_raw() {
            RawWindowHandle::Win32(win32) => Ok(win32.hwnd.get() as HWND),
            _ => Err("unexpected platform window handle".to_string()),
        }
    }

    pub fn set_position(window: &mut Window, x: f32, y: f32) -> Result<(), String> {
        let hwnd = hwnd(window)?;
        // GPUI's bounds are physical pixels, which is what SetWindowPos takes.
        let result = unsafe {
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                x.round() as i32,
                y.round() as i32,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            )
        };
        if result == 0 {
            Err("SetWindowPos failed".to_string())
        } else {
            Ok(())
        }
    }

    pub fn set_always_on_top(window: &mut Window, on: bool) -> Result<(), String> {
        let hwnd = hwnd(window)?;
        let insert_after = if on { HWND_TOPMOST } else { HWND_NOTOPMOST };
        let result = unsafe {
            SetWindowPos(
                hwnd,
                insert_after,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
        };
        if result == 0 {
            Err("SetWindowPos failed".to_string())
        } else {
            Ok(())
        }
    }

    pub fn set_min_size(_window: &mut Window, _width: f32, _height: f32) -> Result<(), String> {
        Err(UNSUPPORTED_MIN_MAX.to_string())
    }

    pub fn set_max_size(_window: &mut Window, _width: f32, _height: f32) -> Result<(), String> {
        Err(UNSUPPORTED_MIN_MAX.to_string())
    }

    /// Toggle the resize frame. GPUI applies the style flags it knows at
    /// creation, so the change is pushed with `SWP_FRAMECHANGED`.
    pub fn set_resizable(window: &mut Window, resizable: bool) -> Result<(), String> {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_MAXIMIZEBOX, WS_THICKFRAME,
        };
        let hwnd = hwnd(window)?;
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            let style = if resizable {
                style | WS_THICKFRAME | WS_MAXIMIZEBOX
            } else {
                style & !(WS_THICKFRAME | WS_MAXIMIZEBOX)
            };
            SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
        Ok(())
    }

    pub fn show(window: &mut Window) -> Result<(), String> {
        let hwnd = hwnd(window)?;
        unsafe { ShowWindow(hwnd, SW_SHOW) };
        Ok(())
    }

    pub fn hide(window: &mut Window) -> Result<(), String> {
        let hwnd = hwnd(window)?;
        unsafe { ShowWindow(hwnd, SW_HIDE) };
        Ok(())
    }

    pub fn is_minimized(window: &Window) -> bool {
        match hwnd(window) {
            Ok(hwnd) => unsafe { IsIconic(hwnd) != 0 },
            Err(_) => false,
        }
    }

    pub fn is_maximized(window: &Window) -> bool {
        match hwnd(window) {
            Ok(hwnd) => unsafe { IsZoomed(hwnd) != 0 },
            Err(_) => false,
        }
    }
}

/// X11: the window calls GPUI does not expose, over a second X connection
/// (plan step 10). Wayland has no absolute positioning or raise, so a Wayland
/// session reports `unsupported` — the honest answer, not a silent no-op.
///
/// **Written but never compiled** on this machine; treat it as unverified
/// until a Linux run proves it (plan §12.1).
#[cfg(target_os = "linux")]
mod imp {
    use gpui::Window;
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use x11_dl::xlib;

    const UNSUPPORTED_WAYLAND: &str =
        "Wayland has no absolute window positioning or raise; use X11 for these calls";

    fn wayland() -> bool {
        crate::desktop::capabilities::is_wayland()
    }

    fn window_id(window: &Window) -> Result<u64, String> {
        let handle = HasWindowHandle::window_handle(window)
            .map_err(|error| format!("no platform window handle: {error}"))?;
        match handle.as_raw() {
            RawWindowHandle::Xlib(xlib_handle) => Ok(xlib_handle.window as u64),
            RawWindowHandle::Xcb(xcb) => Ok(xcb.window.get() as u64),
            _ => Err("the session is not X11".to_string()),
        }
    }

    /// Run `f` with a fresh X connection. GPUI owns its own connection and does
    /// not expose it, and the X protocol allows a second client to move and
    /// raise another client's window.
    fn with_display<R>(f: impl FnOnce(*mut xlib::Display, xlib::Window) -> R) -> Result<R, String> {
        if wayland() {
            return Err(UNSUPPORTED_WAYLAND.to_string());
        }
        let xlib = xlib::Xlib::open().map_err(|error| format!("no X11 library: {error}"))?;
        unsafe {
            let display = (xlib.XOpenDisplay)(std::ptr::null());
            if display.is_null() {
                return Err("could not open an X11 display".to_string());
            }
            let result = f(display, 0);
            (xlib.XCloseDisplay)(display);
            Ok(result)
        }
    }

    fn with_window<R>(
        window: &Window,
        f: impl FnOnce(*mut xlib::Display, xlib::Window, xlib::Window) -> R,
    ) -> Result<R, String> {
        let id = window_id(window)?;
        with_display(|display, _| f(display, id as xlib::Window, id as xlib::Window))
    }

    pub fn set_position(window: &mut Window, x: f32, y: f32) -> Result<(), String> {
        with_window(window, |display, _root, id| unsafe {
            (xlib::XMoveWindow)(display, id, x.round() as i32, y.round() as i32);
            (xlib::XFlush)(display);
        })
    }

    /// Raising is the part of always-on-top X11 itself can do. Staying above
    /// other windows also needs the `_NET_WM_STATE_ABOVE` window-manager hint,
    /// which is not written yet, so `on == false` is a no-op and `on == true`
    /// only raises the window once.
    pub fn set_always_on_top(window: &mut Window, on: bool) -> Result<(), String> {
        with_window(window, |display, _root, id| unsafe {
            if on {
                (xlib::XRaiseWindow)(display, id);
                (xlib::XFlush)(display);
            }
        })
    }

    pub fn set_min_size(window: &mut Window, width: f32, height: f32) -> Result<(), String> {
        with_window(window, |display, _root, id| unsafe {
            let mut hints: xlib::XSizeHints = std::mem::zeroed();
            hints.flags = xlib::PMinSize;
            hints.min_width = width.round() as i32;
            hints.min_height = height.round() as i32;
            (xlib::XSetWMNormalHints)(display, id, &mut hints);
            (xlib::XFlush)(display);
        })
    }

    pub fn set_max_size(window: &mut Window, width: f32, height: f32) -> Result<(), String> {
        with_window(window, |display, _root, id| unsafe {
            let mut hints: xlib::XSizeHints = std::mem::zeroed();
            hints.flags = xlib::PMaxSize;
            hints.max_width = width.round() as i32;
            hints.max_height = height.round() as i32;
            (xlib::XSetWMNormalHints)(display, id, &mut hints);
            (xlib::XFlush)(display);
        })
    }

    pub fn set_resizable(_window: &mut Window, _resizable: bool) -> Result<(), String> {
        // GPUI sets the size hints from `WindowOptions::is_resizable`; changing
        // them at runtime needs the WM_NORMAL_HINTS pair above plus a
        // `_MOTIF_WM_HINTS` update, which is not written yet.
        Err("changing resizability at runtime is not implemented on X11 yet".to_string())
    }

    pub fn show(window: &mut Window) -> Result<(), String> {
        with_window(window, |display, _root, id| unsafe {
            (xlib::XMapWindow)(display, id);
            (xlib::XFlush)(display);
        })
    }

    pub fn hide(window: &mut Window) -> Result<(), String> {
        with_window(window, |display, _root, id| unsafe {
            (xlib::XUnmapWindow)(display, id);
            (xlib::XFlush)(display);
        })
    }

    pub fn is_minimized(window: &Window) -> bool {
        // `XGetWindowAttributes` reports `IsUnmapped` for a hidden window, but
        // X11 has no "minimized" state of its own (the WM owns it).
        with_window(window, |display, _root, id| unsafe {
            let mut attributes: xlib::XWindowAttributes = std::mem::zeroed();
            if (xlib::XGetWindowAttributes)(display, id, &mut attributes) == 0 {
                return false;
            }
            attributes.map_state == xlib::IsUnmapped
        })
        .unwrap_or(false)
    }

    pub fn is_maximized(_window: &Window) -> bool {
        // Only the window manager knows; it would need a `_NET_WM_STATE` read.
        false
    }
}

/// Platforms with no implementation yet (and Wayland's window calls, which the
/// X11 module above reports as unsupported at runtime).
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
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

/// Whether the app shows a Dock icon and owns the menu bar.
///
/// A menu-bar-only app runs as an accessory (plan 7.3), which also stops the
/// launch from activating the app or switching Spaces.
#[cfg(target_os = "macos")]
pub fn set_accessory_app(accessory: bool) {
    use objc::{class, msg_send, sel, sel_impl};
    const REGULAR: isize = 0;
    const ACCESSORY: isize = 1;
    unsafe {
        let app: cocoa::base::id = msg_send![class!(NSApplication), sharedApplication];
        let policy = if accessory { ACCESSORY } else { REGULAR };
        let _: bool = msg_send![app, setActivationPolicy: policy];
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_accessory_app(_accessory: bool) {
    // Windows and Linux have no equivalent policy; a tray-only app there simply
    // has no visible window.
}

/// Suppress the platform's open/close animation for a window.
///
/// The Dev Menu panel is a sheet on macOS, and sheets animate in by default;
/// `NSWindowAnimationBehaviorNone` makes it appear at once.
#[cfg(target_os = "macos")]
pub fn disable_window_animation(window: &mut gpui::Window) {
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    /// `NSWindowAnimationBehaviorNone`.
    const NONE: i64 = 2;
    let Ok(handle) = HasWindowHandle::window_handle(window) else {
        return;
    };
    if let RawWindowHandle::AppKit(appkit) = handle.as_raw() {
        unsafe {
            let ns_view = appkit.ns_view.as_ptr() as id;
            let native: id = msg_send![ns_view, window];
            if !native.is_null() {
                let _: () = msg_send![native, setAnimationBehavior: NONE];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn disable_window_animation(_window: &mut gpui::Window) {}
