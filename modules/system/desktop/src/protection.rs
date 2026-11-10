#[cfg(not(any(target_os = "macos", windows)))]
use rn_gpui_module::ModuleError;

#[cfg(not(any(target_os = "macos", windows)))]
pub fn set(_enabled: bool) -> Result<(), ModuleError> {
    Err(crate::unsupported("content protection"))
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn is_enabled() -> bool {
    false
}

#[cfg(windows)]
pub use win::{is_enabled, set};

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Once;
    use std::time::Duration;

    use rn_gpui_module::ModuleError;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowDisplayAffinity, GetWindowThreadProcessId, IsWindowVisible,
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };

    static PROTECTED: AtomicBool = AtomicBool::new(false);
    static WATCH: Once = Once::new();

    struct Pass {
        enabled: bool,
        all: bool,
    }

    unsafe extern "system" fn visit(window: HWND, param: LPARAM) -> BOOL {
        let pass = &mut *(param as *mut Pass);
        let mut owner = 0u32;
        GetWindowThreadProcessId(window, &mut owner);
        if owner != GetCurrentProcessId() || IsWindowVisible(window) == 0 {
            return 1;
        }
        let wanted = if pass.enabled {
            WDA_EXCLUDEFROMCAPTURE
        } else {
            WDA_NONE
        };
        let mut current = 0u32;
        GetWindowDisplayAffinity(window, &mut current);
        if current != wanted {
            SetWindowDisplayAffinity(window, wanted);
            GetWindowDisplayAffinity(window, &mut current);
        }
        if current != wanted {
            pass.all = false;
        }
        1
    }

    fn sweep(enabled: bool) -> bool {
        let mut pass = Pass { enabled, all: true };
        unsafe { EnumWindows(Some(visit), &mut pass as *mut Pass as LPARAM) };
        pass.all
    }

    /// Windows opened after protection was switched on are protected within half a second.
    fn watch() {
        WATCH.call_once(|| {
            std::thread::spawn(|| loop {
                std::thread::sleep(Duration::from_millis(500));
                if PROTECTED.load(Ordering::SeqCst) {
                    sweep(true);
                }
            });
        });
    }

    pub fn set(enabled: bool) -> Result<(), ModuleError> {
        watch();
        PROTECTED.store(enabled, Ordering::SeqCst);
        if sweep(enabled) {
            Ok(())
        } else {
            Err(crate::failure(
                "the system did not apply content protection to every window",
            ))
        }
    }

    pub fn is_enabled() -> bool {
        PROTECTED.load(Ordering::SeqCst) && sweep(true)
    }
}

#[cfg(target_os = "macos")]
pub use mac::{is_enabled, set};

#[cfg(target_os = "macos")]
mod mac {
    use std::ptr::NonNull;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Once;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSApplication, NSWindow, NSWindowDidBecomeKeyNotification, NSWindowDidExposeNotification,
        NSWindowSharingType,
    };
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSTimer};
    use rn_gpui_module::ModuleError;

    use crate::failure;

    static PROTECTED: AtomicBool = AtomicBool::new(false);
    static OBSERVE: Once = Once::new();

    fn apply(window: &NSWindow, enabled: bool) {
        window.setSharingType(if enabled {
            NSWindowSharingType::None
        } else {
            NSWindowSharingType::ReadOnly
        });
    }

    fn windows(marker: MainThreadMarker) -> Vec<Retained<NSWindow>> {
        NSApplication::sharedApplication(marker)
            .windows()
            .iter()
            .collect()
    }

    /// Windows opened after protection was switched on, such as a tray popover,
    /// are protected as they appear.
    fn observe() {
        OBSERVE.call_once(|| {
            let center = NSNotificationCenter::defaultCenter();
            let block = RcBlock::new(|notification: NonNull<NSNotification>| {
                if !PROTECTED.load(Ordering::SeqCst) {
                    return;
                }
                let notification = unsafe { notification.as_ref() };
                if let Some(object) = notification.object() {
                    if let Some(window) = object.downcast_ref::<NSWindow>() {
                        apply(window, true);
                    }
                }
            });
            // A window can appear without being exposed or becoming key, as a window
            // created hidden does; this catches it within a second.
            let tick = RcBlock::new(|_timer: NonNull<NSTimer>| {
                if !PROTECTED.load(Ordering::SeqCst) {
                    return;
                }
                if let Some(marker) = MainThreadMarker::new() {
                    for window in windows(marker) {
                        apply(&window, true);
                    }
                }
            });
            let timer =
                unsafe { NSTimer::scheduledTimerWithTimeInterval_repeats_block(0.5, true, &tick) };
            std::mem::forget(timer);
            for name in [unsafe { NSWindowDidBecomeKeyNotification }, unsafe {
                NSWindowDidExposeNotification
            }] {
                let observer = unsafe {
                    center.addObserverForName_object_queue_usingBlock(
                        Some(name),
                        None,
                        None,
                        &block,
                    )
                };
                std::mem::forget(observer);
            }
        });
    }

    pub fn set(enabled: bool) -> Result<(), ModuleError> {
        let marker = MainThreadMarker::new().ok_or_else(|| failure("not on the main thread"))?;
        observe();
        PROTECTED.store(enabled, Ordering::SeqCst);
        for window in windows(marker) {
            apply(&window, enabled);
        }
        Ok(())
    }

    /// Whether protection is on and every open window actually carries it.
    pub fn is_enabled() -> bool {
        if !PROTECTED.load(Ordering::SeqCst) {
            return false;
        }
        match MainThreadMarker::new() {
            Some(marker) => windows(marker)
                .iter()
                .all(|window| window.sharingType() == NSWindowSharingType::None),
            None => true,
        }
    }
}
