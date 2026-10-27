//! Where the app keeps small files of its own.

use std::path::PathBuf;

/// `<per-user config dir>/rn-gpui`, which holds window state, I18nManager
/// settings and the single-instance lock.
pub fn app_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join("Library/Application Support"));
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")));
    base.unwrap_or_else(std::env::temp_dir).join("rn-gpui")
}

/// An app id as a file name part.
pub fn safe_id(app_id: &str) -> String {
    app_id.replace(
        |c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_',
        "_",
    )
}
