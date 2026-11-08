#[cfg(not(target_os = "macos"))]
use rn_gpui_module::ModuleError;

#[cfg(not(target_os = "macos"))]
pub fn set(_enabled: bool) -> Result<(), ModuleError> {
    Err(crate::unsupported("content protection"))
}

#[cfg(not(target_os = "macos"))]
pub fn is_enabled() -> bool {
    false
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
