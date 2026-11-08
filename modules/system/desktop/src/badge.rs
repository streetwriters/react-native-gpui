use rn_gpui_module::ModuleError;

#[cfg(not(target_os = "macos"))]
pub fn set(_label: Option<String>) -> Result<(), ModuleError> {
    Err(crate::unsupported("the app badge"))
}

#[cfg(not(target_os = "macos"))]
pub fn get() -> Result<Option<String>, ModuleError> {
    Err(crate::unsupported("the app badge"))
}

#[cfg(not(target_os = "macos"))]
pub fn request_attention(_critical: bool) -> Result<(), ModuleError> {
    Err(crate::unsupported("requesting attention"))
}

#[cfg(not(target_os = "macos"))]
pub fn cancel_attention() -> Result<(), ModuleError> {
    Err(crate::unsupported("requesting attention"))
}

#[cfg(target_os = "macos")]
pub use mac::*;

#[cfg(target_os = "macos")]
mod mac {
    use std::sync::atomic::{AtomicIsize, Ordering};

    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSRequestUserAttentionType};
    use objc2_foundation::NSString;
    use rn_gpui_module::ModuleError;

    static REQUEST: AtomicIsize = AtomicIsize::new(0);

    fn application() -> Result<objc2::rc::Retained<NSApplication>, ModuleError> {
        let marker = MainThreadMarker::new()
            .ok_or_else(|| crate::failure("the Dock is only reachable from the main thread"))?;
        Ok(NSApplication::sharedApplication(marker))
    }

    pub fn set(label: Option<String>) -> Result<(), ModuleError> {
        let tile = application()?.dockTile();
        let label = label.map(|label| NSString::from_str(&label));
        tile.setBadgeLabel(label.as_deref());
        Ok(())
    }

    pub fn get() -> Result<Option<String>, ModuleError> {
        Ok(application()?
            .dockTile()
            .badgeLabel()
            .map(|label| label.to_string()))
    }

    pub fn request_attention(critical: bool) -> Result<(), ModuleError> {
        let application = application()?;
        let kind = if critical {
            NSRequestUserAttentionType::CriticalRequest
        } else {
            NSRequestUserAttentionType::InformationalRequest
        };
        let request = application.requestUserAttention(kind);
        REQUEST.store(request, Ordering::SeqCst);
        Ok(())
    }

    pub fn cancel_attention() -> Result<(), ModuleError> {
        let request = REQUEST.swap(0, Ordering::SeqCst);
        if request != 0 {
            application()?.cancelUserAttentionRequest(request);
        }
        Ok(())
    }
}
