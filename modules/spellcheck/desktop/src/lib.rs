rn_gpui_module::include_specs!();

mod dictionary;
mod platform;

use rn_gpui_module::{ModuleError, ModuleThread};

pub struct Spellcheck;

pub fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("ERR_SPELLCHECK", message.to_string())
}

pub fn unsupported() -> ModuleError {
    ModuleError::with_code(
        "ERR_UNSUPPORTED",
        "spell checking is not supported on this platform".to_owned(),
    )
}

impl NativeSpellcheckSpec for Spellcheck {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeSpellcheckEvents) -> Self {
        Self
    }

    async fn get_languages(&self) -> Result<Vec<LanguageSpec>, ModuleError> {
        Ok(platform::languages()?
            .into_iter()
            .map(|(code, name)| LanguageSpec { code, name })
            .collect())
    }

    async fn check(
        &self,
        text: String,
        languages: Vec<String>,
    ) -> Result<Vec<RangeSpec>, ModuleError> {
        let units: Vec<u16> = text.encode_utf16().collect();
        let mut kept = Vec::new();
        for (start, length) in platform::misspelled(&text, &languages)? {
            let word = units
                .get(start..start + length)
                .map(String::from_utf16_lossy)
                .unwrap_or_default();
            if !dictionary::contains(&word)? {
                kept.push((start, length));
            }
        }
        Ok(kept
            .into_iter()
            .map(|(start, length)| RangeSpec {
                start: start as f64,
                length: length as f64,
            })
            .collect())
    }

    async fn suggest(
        &self,
        word: String,
        languages: Vec<String>,
    ) -> Result<Vec<String>, ModuleError> {
        platform::suggestions(&word, &languages)
    }

    async fn learn(&self, word: String) -> Result<(), ModuleError> {
        dictionary::learn(&word)
    }

    async fn forget(&self, word: String) -> Result<(), ModuleError> {
        dictionary::forget(&word)
    }

    async fn ignore(&self, word: String) -> Result<(), ModuleError> {
        platform::ignore(&word)
    }

    async fn get_learned_words(&self) -> Result<Vec<String>, ModuleError> {
        dictionary::words()
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_spellcheck_module::<Spellcheck>());
}
