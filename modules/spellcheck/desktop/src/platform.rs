#[cfg(target_os = "macos")]
pub use mac::*;
#[cfg(not(target_os = "macos"))]
pub use other::*;

#[cfg(not(target_os = "macos"))]
mod other {
    use rn_gpui_module::ModuleError;

    use crate::unsupported;

    pub fn languages() -> Result<Vec<(String, String)>, ModuleError> {
        Err(unsupported())
    }
    pub fn misspelled(_: &str, _: &[String]) -> Result<Vec<(usize, usize)>, ModuleError> {
        Err(unsupported())
    }
    pub fn suggestions(_: &str, _: &[String]) -> Result<Vec<String>, ModuleError> {
        Err(unsupported())
    }
    pub fn ignore(_: &str) -> Result<(), ModuleError> {
        Err(unsupported())
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::ptr;
    use std::sync::OnceLock;

    use objc2::rc::Retained;
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSLocale, NSLocaleIdentifier, NSRange, NSString};
    use rn_gpui_module::ModuleError;

    const NOT_FOUND: usize = isize::MAX as usize;

    fn checker() -> Retained<NSSpellChecker> {
        NSSpellChecker::sharedSpellChecker()
    }

    /// One document tag for the app, so the words it ignores are remembered
    /// together for as long as it runs.
    fn tag() -> isize {
        static TAG: OnceLock<isize> = OnceLock::new();
        *TAG.get_or_init(|| NSSpellChecker::uniqueSpellDocumentTag())
    }

    fn native_code(code: &str) -> String {
        code.replace('-', "_")
    }

    fn language_arg(code: Option<&str>) -> Option<Retained<NSString>> {
        code.map(|code| NSString::from_str(&native_code(code)))
    }

    pub fn languages() -> Result<Vec<(String, String)>, ModuleError> {
        let locale = NSLocale::currentLocale();
        let mut out: Vec<(String, String)> = Vec::new();
        for identifier in checker().availableLanguages().iter() {
            let code = identifier.to_string().replace('_', "-");
            if out.iter().any(|(known, _)| *known == code) {
                continue;
            }
            let name = unsafe { locale.displayNameForKey_value(NSLocaleIdentifier, &identifier) }
                .map(|name| name.to_string())
                .unwrap_or_else(|| code.clone());
            out.push((code, name));
        }
        Ok(out)
    }

    fn misspelled_in(text: &NSString, language: Option<&str>) -> Vec<(usize, usize)> {
        let checker = checker();
        let language = language_arg(language);
        let mut found = Vec::new();
        let mut start = 0isize;
        loop {
            let range: NSRange = unsafe {
                checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                    text,
                    start,
                    language.as_deref(),
                    false,
                    tag(),
                    ptr::null_mut(),
                )
            };
            if range.location == NOT_FOUND || range.length == 0 {
                break;
            }
            found.push((range.location, range.length));
            start = (range.location + range.length) as isize;
        }
        found
    }

    /// The ranges no enabled language accepts. With no language given the
    /// system's own choice decides.
    pub fn misspelled(
        text: &str,
        languages: &[String],
    ) -> Result<Vec<(usize, usize)>, ModuleError> {
        let text = NSString::from_str(text);
        let mut languages = languages.iter();
        let Some(first) = languages.next() else {
            return Ok(misspelled_in(&text, None));
        };
        let mut found = misspelled_in(&text, Some(first));
        for language in languages {
            let other = misspelled_in(&text, Some(language));
            found.retain(|range| other.contains(range));
        }
        Ok(found)
    }

    pub fn suggestions(word: &str, languages: &[String]) -> Result<Vec<String>, ModuleError> {
        let checker = checker();
        let text = NSString::from_str(word);
        let range = NSRange::new(0, text.length());
        let mut out: Vec<String> = Vec::new();
        let none: [Option<&str>; 1] = [None];
        let choices: Vec<Option<&str>> = if languages.is_empty() {
            none.to_vec()
        } else {
            languages.iter().map(|code| Some(code.as_str())).collect()
        };
        for language in choices {
            let language = language_arg(language);
            let guesses = checker.guessesForWordRange_inString_language_inSpellDocumentWithTag(
                range,
                &text,
                language.as_deref(),
                tag(),
            );
            for guess in guesses.iter().flat_map(|list| list.iter()) {
                let guess = guess.to_string();
                if !out.contains(&guess) {
                    out.push(guess);
                }
            }
        }
        Ok(out)
    }

    pub fn ignore(word: &str) -> Result<(), ModuleError> {
        checker().ignoreWord_inSpellDocumentWithTag(&NSString::from_str(word), tag());
        Ok(())
    }
}
