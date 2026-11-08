use auto_launch::AutoLaunchBuilder;
use rn_gpui_module::ModuleError;

use crate::failure;

/// The name the login item is stored under: the bundle identifier of a packaged
/// app, otherwise the executable's name.
fn item_name() -> String {
    #[cfg(target_os = "macos")]
    if let Some(identifier) = objc2_foundation::NSBundle::mainBundle().bundleIdentifier() {
        return identifier.to_string();
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "app".to_string())
}

fn item(args: &[String]) -> Result<auto_launch::AutoLaunch, ModuleError> {
    let exe = std::env::current_exe().map_err(failure)?;
    let mut builder = AutoLaunchBuilder::new();
    builder
        .set_app_name(&item_name())
        .set_app_path(&exe.to_string_lossy())
        .set_args(args);
    #[cfg(target_os = "macos")]
    builder.set_macos_launch_mode(auto_launch::MacOSLaunchMode::LaunchAgent);
    builder.build().map_err(failure)
}

pub fn is_enabled() -> Result<bool, ModuleError> {
    item(&[])?.is_enabled().map_err(failure)
}

pub fn set(enabled: bool, args: &[String]) -> Result<(), ModuleError> {
    let item = item(args)?;
    if enabled {
        item.enable().map_err(failure)
    } else if item.is_enabled().map_err(failure)? {
        item.disable().map_err(failure)
    } else {
        Ok(())
    }
}
