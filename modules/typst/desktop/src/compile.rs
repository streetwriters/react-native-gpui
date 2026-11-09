use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration as StdDuration, Instant};

use chrono::{Datelike, Local};
use typst::diag::{FileError, FileResult, Severity, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Dict, Duration, Str, Value};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World, WorldExt};
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards};

use crate::fonts::{self, AppFont, FontSet};

pub const MAX_SOURCE_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_FILES: usize = 2000;
pub const MAX_FILE_BYTES: usize = 256 * 1024 * 1024;
const MAX_DISTINCT_NAMES: usize = 20_000;

pub struct FileInput {
    pub name: String,
    pub data: Option<Vec<u8>>,
    pub path: Option<String>,
}

pub struct Job {
    pub id: u32,
    pub source: String,
    pub files: Vec<FileInput>,
    pub fonts: Vec<AppFont>,
    pub system_fonts: SystemFonts,
    pub inputs: Vec<(String, String)>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub pdf_a: bool,
    pub timeout: StdDuration,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SystemFonts {
    Auto,
    Always,
    Never,
}

pub struct Diagnostic {
    pub severity: &'static str,
    pub message: String,
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub hints: Vec<String>,
}

pub struct Outcome {
    pub pdf: Option<Vec<u8>>,
    pub pages: u32,
    pub diagnostics: Vec<Diagnostic>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub system_fonts_loaded: bool,
}

fn failure(message: impl Into<String>) -> Outcome {
    Outcome {
        pdf: None,
        pages: 0,
        diagnostics: vec![Diagnostic {
            severity: "error",
            message: message.into(),
            file: String::new(),
            line: 0,
            column: 0,
            hints: Vec::new(),
        }],
        timed_out: false,
        cancelled: false,
        system_fonts_loaded: fonts::system_loaded(),
    }
}

fn names() -> &'static Mutex<HashSet<String>> {
    static NAMES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    NAMES.get_or_init(|| Mutex::new(HashSet::new()))
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name != "main.typ"
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn file_id(name: &str) -> Option<FileId> {
    let path = VirtualPath::new(name).ok()?;
    Some(RootedPath::new(VirtualRoot::Project, path).intern())
}

fn library() -> Arc<LazyHash<Library>> {
    static DEFAULT: OnceLock<Arc<LazyHash<Library>>> = OnceLock::new();
    DEFAULT
        .get_or_init(|| Arc::new(LazyHash::new(Library::default())))
        .clone()
}

fn library_with(inputs: &[(String, String)]) -> Arc<LazyHash<Library>> {
    if inputs.is_empty() {
        return library();
    }
    let mut dict = Dict::new();
    for (key, value) in inputs {
        dict.insert(
            Str::from(key.as_str()),
            Value::Str(Str::from(value.as_str())),
        );
    }
    Arc::new(LazyHash::new(Library::builder().with_inputs(dict).build()))
}

struct Guard {
    abort: Arc<AtomicBool>,
    deadline: Instant,
    timed_out: AtomicBool,
}

impl Guard {
    fn stopped(&self) -> bool {
        if self.abort.load(Ordering::Relaxed) {
            return true;
        }
        if Instant::now() >= self.deadline {
            self.timed_out.store(true, Ordering::Relaxed);
            return true;
        }
        false
    }
}

struct JobWorld {
    line_offset: u32,
    library: Arc<LazyHash<Library>>,
    fonts: Arc<FontSet>,
    main: FileId,
    source: Source,
    files: HashMap<FileId, Bytes>,
    guard: Guard,
}

impl World for JobWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.fonts.book
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if self.guard.stopped() {
            return Err(FileError::Other(Some("the compile was stopped".into())));
        }
        if id == self.main {
            Ok(self.source.clone())
        } else {
            Err(FileError::AccessDenied)
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if self.guard.stopped() {
            return Err(FileError::Other(Some("the compile was stopped".into())));
        }
        self.files.get(&id).cloned().ok_or(FileError::AccessDenied)
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.font(index)
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        let now = Local::now();
        Datetime::from_ymd(now.year(), now.month() as u8, now.day() as u8)
    }
}

fn describe(world: &JobWorld, diagnostic: &SourceDiagnostic) -> Diagnostic {
    let mut file = String::new();
    let (mut line, mut column) = (0, 0);
    if let Some(id) = diagnostic.span.id() {
        file = if id == world.main {
            "main.typ".to_string()
        } else {
            id.vpath().get_without_slash().to_string()
        };
        if let (Some(range), Ok(source)) = (world.range(diagnostic.span), world.source(id)) {
            if let Some((l, c)) = source.lines().byte_to_line_column(range.start) {
                line = (l as u32 + 1).saturating_sub(if id == world.main {
                    world.line_offset
                } else {
                    0
                });
                column = c as u32 + 1;
            }
        }
    }
    Diagnostic {
        severity: match diagnostic.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        },
        message: diagnostic.message.to_string(),
        file,
        line,
        column,
        hints: diagnostic.hints.iter().map(|h| h.v.to_string()).collect(),
    }
}

pub fn jobs() -> &'static Mutex<HashMap<u32, Arc<AtomicBool>>> {
    static JOBS: OnceLock<Mutex<HashMap<u32, Arc<AtomicBool>>>> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn cancel(id: u32) {
    if let Some(flag) = jobs().lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

pub fn run(job: Job) -> Outcome {
    if job.source.len() > MAX_SOURCE_BYTES {
        return failure("the source is larger than the 8 MB limit");
    }
    if job.files.len() > MAX_FILES {
        return failure(format!("more than {MAX_FILES} files"));
    }
    let abort = Arc::new(AtomicBool::new(false));
    let id = job.id;
    jobs().lock().unwrap().insert(id, abort.clone());
    let outcome = compile(job, abort);
    jobs().lock().unwrap().remove(&id);
    outcome
}

fn quoted(text: &str) -> String {
    let mut out = String::from("\"");
    for c in text.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' | '\r' => out.push(' '),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn with_metadata(source: String, title: &Option<String>, author: &Option<String>) -> String {
    let mut fields = Vec::new();
    if let Some(title) = title {
        fields.push(format!("title: {}", quoted(title)));
    }
    if let Some(author) = author {
        fields.push(format!("author: {}", quoted(author)));
    }
    if fields.is_empty() {
        source
    } else {
        format!("#set document({})\n{source}", fields.join(", "))
    }
}

fn compile(job: Job, abort: Arc<AtomicBool>) -> Outcome {
    let mut files = HashMap::new();
    let mut total = 0usize;
    {
        let mut known = names().lock().unwrap();
        for file in &job.files {
            if !valid_name(&file.name) {
                return failure(format!("\"{}\" is not a valid file name", file.name));
            }
            if known.len() >= MAX_DISTINCT_NAMES && !known.contains(&file.name) {
                return failure("too many distinct file names in this process; reuse names");
            }
            known.insert(file.name.clone());
        }
    }
    for file in &job.files {
        let data = match (&file.data, &file.path) {
            (Some(data), _) => data.clone(),
            (None, Some(path)) => match std::fs::read(path) {
                Ok(data) => data,
                Err(error) => return failure(format!("cannot read {}: {error}", file.name)),
            },
            _ => return failure(format!("{} has no data", file.name)),
        };
        total += data.len();
        if total > MAX_FILE_BYTES {
            return failure("the files are larger than the 256 MB limit");
        }
        let Some(id) = file_id(&file.name) else {
            return failure(format!("\"{}\" is not a valid file name", file.name));
        };
        files.insert(id, Bytes::new(data));
    }

    let mut set = fonts::combined(&job.fonts, job.system_fonts == SystemFonts::Always);
    if job.system_fonts == SystemFonts::Auto && fonts::needs_system(&job.source, &set) {
        set = fonts::combined(&job.fonts, true);
    }
    let system_fonts_loaded = fonts::system_loaded();

    let Some(main) = file_id("main.typ") else {
        return failure("internal: main path");
    };
    let line_offset = u32::from(job.title.is_some() || job.author.is_some());
    let world = JobWorld {
        line_offset,
        library: library_with(&job.inputs),
        fonts: set,
        main,
        source: Source::new(main, with_metadata(job.source, &job.title, &job.author)),
        files,
        guard: Guard {
            abort,
            deadline: Instant::now() + job.timeout,
            timed_out: AtomicBool::new(false),
        },
    };

    let warned = typst::compile::<typst_layout::PagedDocument>(&world);
    let mut diagnostics: Vec<Diagnostic> = warned
        .warnings
        .iter()
        .map(|d| describe(&world, d))
        .collect();
    let timed_out = world.guard.timed_out.load(Ordering::Relaxed);
    let cancelled = !timed_out && world.guard.abort.load(Ordering::Relaxed);
    let document = match warned.output {
        Ok(document) => document,
        Err(errors) => {
            diagnostics.extend(errors.iter().map(|d| describe(&world, d)));
            return Outcome {
                pdf: None,
                pages: 0,
                diagnostics,
                timed_out,
                cancelled,
                system_fonts_loaded,
            };
        }
    };

    let mut options = PdfOptions::default();
    if job.pdf_a {
        if let Ok(standards) = PdfStandards::new(&[PdfStandard::A_2b]) {
            options.standards = standards;
        }
    }
    match typst_pdf::pdf(&document, &options) {
        Ok(pdf) => Outcome {
            pages: document.pages().len() as u32,
            pdf: Some(pdf),
            diagnostics,
            timed_out: false,
            cancelled: false,
            system_fonts_loaded,
        },
        Err(errors) => {
            diagnostics.extend(errors.iter().map(|d| describe(&world, d)));
            Outcome {
                pdf: None,
                pages: 0,
                diagnostics,
                timed_out,
                cancelled,
                system_fonts_loaded,
            }
        }
    }
}

type Staged = (Vec<FileInput>, Vec<AppFont>);

fn staged() -> &'static Mutex<HashMap<u32, Staged>> {
    static STAGED: OnceLock<Mutex<HashMap<u32, Staged>>> = OnceLock::new();
    STAGED.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn stage_file(job: u32, name: String, data: Vec<u8>) {
    staged()
        .lock()
        .unwrap()
        .entry(job)
        .or_default()
        .0
        .push(FileInput {
            name,
            data: Some(data),
            path: None,
        });
}

pub fn stage_font(job: u32, data: Vec<u8>) {
    staged()
        .lock()
        .unwrap()
        .entry(job)
        .or_default()
        .1
        .push(AppFont {
            data: Some(data),
            path: None,
        });
}

pub fn take_staged(job: u32) -> Staged {
    staged().lock().unwrap().remove(&job).unwrap_or_default()
}

fn outputs() -> &'static Mutex<HashMap<u32, Vec<u8>>> {
    static OUTPUTS: OnceLock<Mutex<HashMap<u32, Vec<u8>>>> = OnceLock::new();
    OUTPUTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn keep_output(job: u32, pdf: Vec<u8>) {
    outputs().lock().unwrap().insert(job, pdf);
}

pub fn take_output(job: u32) -> Option<Vec<u8>> {
    outputs().lock().unwrap().remove(&job)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(source: &str) -> Job {
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
        Job {
            id: NEXT.fetch_add(1, Ordering::Relaxed),
            source: source.to_string(),
            files: Vec::new(),
            fonts: Vec::new(),
            system_fonts: SystemFonts::Never,
            inputs: Vec::new(),
            title: None,
            author: None,
            pdf_a: false,
            timeout: StdDuration::from_secs(20),
        }
    }

    fn errors(outcome: &Outcome) -> String {
        outcome
            .diagnostics
            .iter()
            .filter(|d| d.severity == "error")
            .map(|d| d.message.clone())
            .collect::<Vec<_>>()
            .join("; ")
    }

    #[test]
    fn compiles_a_note_to_a_pdf() {
        let outcome = run(job(
            "= Title\nSome *bold* text and $x^2$.\n#pagebreak()\nPage two",
        ));
        assert_eq!(outcome.pages, 2);
        assert!(outcome.pdf.unwrap().starts_with(b"%PDF-"));
    }

    #[test]
    fn reports_errors_with_a_position() {
        let outcome = run(job("= Title\n#undefined-function()"));
        assert!(outcome.pdf.is_none());
        let first = &outcome.diagnostics[0];
        assert_eq!(
            (first.severity, first.file.as_str(), first.line),
            ("error", "main.typ", 2)
        );
    }

    #[test]
    fn serves_only_the_files_it_was_given() {
        let png: [u8; 70] = [
            0x89, 0x50, 0x4e, 0x47, 0xd, 0xa, 0x1a, 0xa, 0x0, 0x0, 0x0, 0xd, 0x49, 0x48, 0x44,
            0x52, 0x0, 0x0, 0x0, 0x1, 0x0, 0x0, 0x0, 0x1, 0x8, 0x6, 0x0, 0x0, 0x0, 0x1f, 0x15,
            0xc4, 0x89, 0x0, 0x0, 0x0, 0xd, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf,
            0xc0, 0xf0, 0x1f, 0x0, 0x5, 0x0, 0x1, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x0, 0x0, 0x0, 0x0,
            0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ];
        let mut with_file = job("#image(\"img-0.png\", width: 2cm)");
        with_file.files.push(FileInput {
            name: "img-0.png".into(),
            data: Some(png.to_vec()),
            path: None,
        });
        let outcome = run(with_file);
        assert!(outcome.pdf.is_some(), "{}", errors(&outcome));

        let text = std::fs::read_to_string("/etc/hosts").is_ok();
        assert!(text);
        for source in [
            "#read(\"/etc/hosts\")",
            "#read(\"../../../../etc/hosts\")",
            "#image(\"/etc/hosts\")",
            "#include \"/etc/hosts\"",
            "#import \"@preview/cetz:0.3.0\": canvas",
            "#read(\"img-1.png\")",
        ] {
            let outcome = run(job(source));
            assert!(outcome.pdf.is_none(), "{source} compiled");
        }
    }

    #[test]
    fn refuses_bad_names_and_too_many_files() {
        for name in [
            "../x.png",
            "/etc/hosts",
            "a b.png",
            "main.typ",
            ".hidden",
            "",
        ] {
            let mut bad = job("x");
            bad.files.push(FileInput {
                name: name.into(),
                data: Some(vec![1]),
                path: None,
            });
            assert!(run(bad).pdf.is_none(), "{name} was accepted");
        }
        let mut many = job("x");
        for index in 0..=MAX_FILES {
            many.files.push(FileInput {
                name: format!("f-{index}.bin"),
                data: Some(vec![0]),
                path: None,
            });
        }
        assert!(errors(&run(many)).contains("more than"));
    }

    #[test]
    fn a_stopped_job_ends_without_a_pdf() {
        let mut stopped = job("#read(\"img-0.png\")");
        stopped.timeout = StdDuration::from_millis(0);
        stopped.files.push(FileInput {
            name: "img-0.png".into(),
            data: Some(vec![0; 16]),
            path: None,
        });
        let outcome = run(stopped);
        assert!(outcome.pdf.is_none());
        assert!(outcome.timed_out);
    }

    #[test]
    fn document_metadata_is_set_without_moving_lines() {
        let mut titled = job("= A\n#undefined()");
        titled.title = Some("a \"quoted\" title".into());
        let outcome = run(titled);
        assert_eq!(outcome.diagnostics[0].line, 2);
        assert!(!errors(&outcome).contains("title"));
    }

    #[test]
    #[ignore]
    fn measure() {
        let dir = std::env::var("NOTE_DIR").unwrap();
        let mut input = job(&std::fs::read_to_string(format!("{dir}/main.typ")).unwrap());
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if name != "main.typ" {
                input.files.push(FileInput {
                    name,
                    data: Some(std::fs::read(&path).unwrap()),
                    path: None,
                });
            }
        }
        let start = Instant::now();
        let outcome = run(input);
        println!(
            "MEASURE {dir}: {} ms, {} pages, {} KB",
            start.elapsed().as_millis(),
            outcome.pages,
            outcome.pdf.map_or(0, |p| p.len() / 1024)
        );
    }
}
