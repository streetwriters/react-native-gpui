//! The app's own dictionary: words its user taught it, kept in a file under
//! the app's support directory. It is not the system's dictionary, so a word
//! learned here is not accepted in other apps, as in a browser's.

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Mutex;

use rn_gpui_module::ModuleError;

use crate::failure;

static WORDS: Mutex<Option<BTreeSet<String>>> = Mutex::new(None);

fn app_name() -> String {
    #[cfg(target_os = "macos")]
    if let Some(identifier) = objc2_foundation::NSBundle::mainBundle().bundleIdentifier() {
        return identifier.to_string();
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "app".to_string())
}

fn path() -> Option<PathBuf> {
    let base = if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME")?).join("Library/Application Support")
    } else if cfg!(windows) {
        PathBuf::from(std::env::var_os("APPDATA")?)
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?
    };
    Some(base.join(app_name()).join("spellcheck-dictionary.txt"))
}

fn with<T>(change: impl FnOnce(&mut BTreeSet<String>) -> T, save: bool) -> Result<T, ModuleError> {
    let mut guard = WORDS.lock().unwrap();
    let words = guard.get_or_insert_with(|| {
        path()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .map(|text| {
                text.lines()
                    .map(str::trim)
                    .filter(|word| !word.is_empty())
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    });
    let result = change(words);
    if save {
        let path = path().ok_or_else(|| failure("no place to keep the dictionary"))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(failure)?;
        }
        let text: String = words.iter().map(|word| format!("{word}\n")).collect();
        let temporary = path.with_extension("tmp");
        std::fs::write(&temporary, text).map_err(failure)?;
        std::fs::rename(&temporary, &path).map_err(failure)?;
    }
    Ok(result)
}

pub fn learn(word: &str) -> Result<(), ModuleError> {
    with(
        |words| {
            words.insert(word.to_owned());
        },
        true,
    )
}

pub fn forget(word: &str) -> Result<(), ModuleError> {
    with(
        |words| {
            words.remove(word);
        },
        true,
    )
}

pub fn words() -> Result<Vec<String>, ModuleError> {
    with(|words| words.iter().cloned().collect(), false)
}

/// Whether the dictionary holds the word, in any letter case.
pub fn contains(word: &str) -> Result<bool, ModuleError> {
    let lower = word.to_lowercase();
    with(
        |words| words.contains(word) || words.iter().any(|known| known.to_lowercase() == lower),
        false,
    )
}
