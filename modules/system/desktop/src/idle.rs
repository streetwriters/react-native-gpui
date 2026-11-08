use rn_gpui_module::ModuleError;

/// Seconds since the user last pressed a key, moved or clicked the mouse, or
/// touched the trackpad, anywhere in the session.
pub fn seconds() -> Result<f64, ModuleError> {
    imp::seconds()
}

#[cfg(target_os = "macos")]
mod imp {
    use rn_gpui_module::ModuleError;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }

    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;

    pub fn seconds() -> Result<f64, ModuleError> {
        let seconds = unsafe {
            CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE)
        };
        if seconds.is_finite() && seconds >= 0.0 {
            Ok(seconds)
        } else {
            Err(crate::failure("the system did not report an idle time"))
        }
    }
}

#[cfg(windows)]
mod imp {
    use rn_gpui_module::ModuleError;
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub fn seconds() -> Result<f64, ModuleError> {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&mut info) } == 0 {
            return Err(crate::failure("the system did not report an idle time"));
        }
        let milliseconds = unsafe { GetTickCount() }.wrapping_sub(info.dwTime);
        Ok(f64::from(milliseconds) / 1000.0)
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    use rn_gpui_module::ModuleError;

    pub fn seconds() -> Result<f64, ModuleError> {
        Err(crate::unsupported("idle time"))
    }
}
