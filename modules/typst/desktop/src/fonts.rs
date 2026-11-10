use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use typst::foundations::Bytes;
use typst::text::{Font, FontBook, FontInfo};
use typst::utils::LazyHash;

const MATH: &[u8] = include_bytes!("../fonts/NewCMMath-Regular.otf");
const MONO: &[u8] = include_bytes!("../fonts/DejaVuSansMono.ttf");
const MONO_BOLD: &[u8] = include_bytes!("../fonts/DejaVuSansMono-Bold.ttf");

pub enum Slot {
    Ready(Font),
    File(PathBuf, u32),
}

pub struct FontSet {
    pub book: LazyHash<FontBook>,
    slots: Vec<Slot>,
}

impl FontSet {
    pub fn font(&self, index: usize) -> Option<Font> {
        match self.slots.get(index)? {
            Slot::Ready(font) => Some(font.clone()),
            Slot::File(path, face) => Font::new(Bytes::new(std::fs::read(path).ok()?), *face),
        }
    }

    pub fn covers(&self, c: char) -> bool {
        (0..self.slots.len()).any(|index| {
            self.book
                .info(index)
                .is_some_and(|info| info.coverage.contains(c as u32))
        })
    }

    pub fn has_family(&self, family: &str) -> bool {
        self.book.contains_family(&family.to_lowercase())
    }
}

struct Builder {
    book: FontBook,
    slots: Vec<Slot>,
}

impl Builder {
    fn new() -> Self {
        Self {
            book: FontBook::new(),
            slots: Vec::new(),
        }
    }

    fn data(&mut self, data: Bytes) {
        for font in Font::iter(data) {
            self.book.push(font.info().clone());
            self.slots.push(Slot::Ready(font));
        }
    }

    fn finish(self) -> FontSet {
        FontSet {
            book: LazyHash::new(self.book),
            slots: self.slots,
        }
    }
}

fn bundled() -> &'static Arc<FontSet> {
    static BUNDLED: OnceLock<Arc<FontSet>> = OnceLock::new();
    BUNDLED.get_or_init(|| {
        let mut builder = Builder::new();
        for data in [MATH, MONO, MONO_BOLD] {
            builder.data(Bytes::new(data));
        }
        Arc::new(builder.finish())
    })
}

pub struct AppFont {
    pub data: Option<Vec<u8>>,
    pub path: Option<String>,
}

fn system_faces() -> Vec<(PathBuf, u32, FontInfo)> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut faces = Vec::new();
    for face in db.faces() {
        let fontdb::Source::File(path) = &face.source else {
            continue;
        };
        let info = db.with_face_data(face.id, |data, index| FontInfo::new(data, index));
        if let Some(Some(info)) = info {
            faces.push((path.clone(), face.index, info));
        }
    }
    faces
}

type Combined = (u64, Arc<FontSet>);

fn cache() -> &'static Mutex<[Option<Combined>; 2]> {
    static CACHE: OnceLock<Mutex<[Option<Combined>; 2]>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new([None, None]))
}

fn system_cache() -> &'static Mutex<Option<Arc<Vec<(PathBuf, u32, FontInfo)>>>> {
    static SYSTEM: OnceLock<Mutex<Option<Arc<Vec<(PathBuf, u32, FontInfo)>>>>> = OnceLock::new();
    SYSTEM.get_or_init(|| Mutex::new(None))
}

pub fn system_loaded() -> bool {
    system_cache().lock().unwrap().is_some()
}

fn system() -> Arc<Vec<(PathBuf, u32, FontInfo)>> {
    let mut slot = system_cache().lock().unwrap();
    slot.get_or_insert_with(|| Arc::new(system_faces())).clone()
}

fn key(app: &[AppFont]) -> u64 {
    let mut hasher = DefaultHasher::new();
    for font in app {
        font.path.hash(&mut hasher);
        if let Some(data) = &font.data {
            data.len().hash(&mut hasher);
            data.hash(&mut hasher);
        }
    }
    hasher.finish()
}

pub fn combined(app: &[AppFont], with_system: bool) -> Arc<FontSet> {
    let key = key(app);
    let which = usize::from(with_system);
    {
        let cache = cache().lock().unwrap();
        if let Some((cached, set)) = &cache[which] {
            if *cached == key {
                return set.clone();
            }
        }
    }
    let mut builder = Builder::new();
    let base = bundled();
    for index in 0..base.slots.len() {
        if let (Some(font), Some(info)) = (base.font(index), base.book.info(index)) {
            builder.book.push(info.clone());
            builder.slots.push(Slot::Ready(font));
        }
    }
    for font in app {
        let data = match (&font.data, &font.path) {
            (Some(data), _) => Some(data.clone()),
            (None, Some(path)) => std::fs::read(resolve_path(path)).ok(),
            _ => None,
        };
        if let Some(data) = data {
            builder.data(Bytes::new(data));
        }
    }
    if with_system {
        for (path, index, info) in system().iter() {
            builder.book.push(info.clone());
            builder.slots.push(Slot::File(path.clone(), *index));
        }
    }
    let set = Arc::new(builder.finish());
    cache().lock().unwrap()[which] = Some((key, set.clone()));
    set
}

pub fn resolve_path(path: &str) -> PathBuf {
    let Some(relative) = path.strip_prefix("file://assets/") else {
        return PathBuf::from(path.strip_prefix("file://").unwrap_or(path));
    };
    let relative = std::path::Path::new(relative);
    let escapes = relative.components().any(|part| {
        matches!(
            part,
            std::path::Component::ParentDir | std::path::Component::RootDir
        )
    });
    if escapes {
        return PathBuf::new();
    }
    let assets = react_native_gpui::default_assets_dir().or_else(|| {
        std::env::current_dir()
            .ok()
            .map(|cwd| react_native_gpui::assets_in(&cwd))
    });
    match assets {
        Some(assets) => assets.join(relative),
        None => PathBuf::new(),
    }
}

fn requested_families(source: &str) -> Vec<String> {
    let mut families = Vec::new();
    let mut rest = source;
    while let Some(at) = rest.find("font:") {
        rest = &rest[at + 5..];
        let window: String = rest.chars().take(160).collect();
        let end = window.find(')').unwrap_or(window.len());
        let list = window
            .split_once('(')
            .filter(|(before, _)| before.trim().is_empty())
            .map(|(_, tail)| &tail[..tail.find(')').unwrap_or(tail.len())])
            .unwrap_or(&window[..end.min(window.find(',').unwrap_or(end))]);
        let mut chars = list.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '"' {
                let name: String = chars.by_ref().take_while(|c| *c != '"').collect();
                if !name.is_empty() {
                    families.push(name);
                }
            }
        }
    }
    families
}

pub fn needs_system(source: &str, set: &FontSet) -> bool {
    if requested_families(source)
        .iter()
        .any(|family| !set.has_family(family))
    {
        return true;
    }
    lacks_glyphs(source, set)
}

pub fn lacks_glyphs(source: &str, set: &FontSet) -> bool {
    let mut seen = std::collections::HashSet::new();
    source.chars().any(|c| {
        let code = c as u32;
        !c.is_whitespace() && !c.is_control() && code > 0x7e && seen.insert(c) && !set.covers(c)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_font_uris_resolve_inside_the_assets_directory() {
        std::env::set_var("RN_GPUI_ASSETS_DIR", "/opt/app/assets");
        assert_eq!(
            resolve_path("file://assets/fonts/Inter-Regular.ttf"),
            PathBuf::from("/opt/app/assets/fonts/Inter-Regular.ttf")
        );
        assert_eq!(resolve_path("file://assets/../etc/passwd"), PathBuf::new());
        assert_eq!(resolve_path("/tmp/a.ttf"), PathBuf::from("/tmp/a.ttf"));
        assert_eq!(
            resolve_path("file:///tmp/a.ttf"),
            PathBuf::from("/tmp/a.ttf")
        );
    }

    #[test]
    fn fallback_mode_skips_unavailable_family_names_and_scans_for_missing_glyphs() {
        let set = bundled();
        let stack = "#set text(font: (\"Hack\", \"Consolas\", \"Frutiger\", \"DejaVu Sans Mono\"))\nHello world";
        assert!(needs_system(stack, set));
        assert!(!lacks_glyphs(stack, set));
        let cjk = "#set text(font: (\"Frutiger\"))\nHello \u{4f60}\u{597d}";
        assert!(lacks_glyphs(cjk, set));
    }

    #[test]
    fn reads_font_families_from_set_rules() {
        let families = requested_families(
            "#set text(font: (\"Inter\", \"Noto Sans\"), size: 11pt)\n#text(font: \"Menlo\")[x]",
        );
        assert_eq!(families, vec!["Inter", "Noto Sans", "Menlo"]);
    }

    #[test]
    fn system_fonts_are_needed_for_missing_families_and_glyphs_only() {
        let set = combined(&[], false);
        assert!(!needs_system(
            "#set text(font: \"DejaVu Sans Mono\")\nHello",
            &set
        ));
        assert!(needs_system("#set text(font: \"Inter\")\nHello", &set));
        assert!(needs_system("Hello \u{4f60}\u{597d}", &set));
        assert!(!needs_system("Hello \u{3b1}\u{3b2}", &set));
    }
}
