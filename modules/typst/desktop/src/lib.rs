rn_gpui_module::include_specs!();

mod compile;
mod fonts;
#[cfg(target_os = "macos")]
mod print_macos;

use std::time::Duration;

use futures::channel::mpsc::unbounded;
use futures::StreamExt;
use rn_gpui_module::ArrayBuffer;
use rn_gpui_module::{ModuleError, ModuleThread};

use compile::{FileInput, Job, SystemFonts};
use fonts::AppFont;

pub fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("ERR_TYPST", message.to_string())
}

pub struct Typst;

impl NativeTypstSpec for Typst {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeTypstEvents) -> Self {
        Self
    }

    async fn compile(
        &self,
        options: TypstCompileOptions,
    ) -> Result<TypstCompileResult, ModuleError> {
        let output_path = options.output_path.clone();
        let system_fonts = match options.system_fonts.as_str() {
            "always" => SystemFonts::Always,
            "fallback" => SystemFonts::Fallback,
            "never" => SystemFonts::Never,
            _ => SystemFonts::Auto,
        };
        let id = options.job_id as u32;
        let (mut files, mut app_fonts) = compile::take_staged(id);
        files.extend(options.files.into_iter().map(|file| FileInput {
            name: file.name,
            data: None,
            path: Some(file.path),
        }));
        app_fonts.extend(options.fonts.into_iter().map(|font| AppFont {
            data: None,
            path: Some(font.path),
        }));
        let job = Job {
            id,
            source: options.source,
            files,
            fonts: app_fonts,
            system_fonts,
            inputs: options
                .inputs
                .into_iter()
                .map(|input| (input.key, input.value))
                .collect(),
            title: options.title,
            author: options.author,
            pdf_a: options.pdf_a,
            timeout: Duration::from_millis(options.timeout_ms.max(1.0) as u64),
        };

        let timeout = job.timeout;
        let (sender, mut receiver) = unbounded::<Option<compile::Outcome>>();
        let done = sender.clone();
        std::thread::spawn(move || {
            let _ = done.unbounded_send(Some(compile::run(job)));
        });
        std::thread::spawn(move || {
            std::thread::sleep(timeout);
            let _ = sender.unbounded_send(None);
        });
        let outcome = match receiver.next().await {
            Some(Some(outcome)) => outcome,
            Some(None) => {
                compile::cancel(id);
                compile::take_staged(id);
                return Ok(TypstCompileResult {
                    ok: false,
                    pdf_size: 0.0,
                    path: None,
                    pages: 0.0,
                    diagnostics: Vec::new(),
                    timed_out: true,
                    cancelled: false,
                    system_fonts_loaded: false,
                });
            }
            None => return Err(failure("the compile stopped unexpectedly")),
        };

        let mut path = None;
        let mut pdf = None;
        if let Some(bytes) = outcome.pdf {
            match output_path {
                Some(target) => {
                    std::fs::write(&target, &bytes)
                        .map_err(|error| failure(format!("cannot write {target}: {error}")))?;
                    path = Some(target);
                }
                None => {
                    pdf = Some(bytes.len());
                    compile::keep_output(id, bytes);
                }
            }
        }
        Ok(TypstCompileResult {
            ok: path.is_some() || pdf.is_some(),
            pdf_size: pdf.unwrap_or(0) as f64,
            path,
            pages: f64::from(outcome.pages),
            diagnostics: outcome
                .diagnostics
                .into_iter()
                .map(|d| TypstDiagnostic {
                    severity: d.severity.to_string(),
                    message: d.message,
                    file: d.file,
                    line: f64::from(d.line),
                    column: f64::from(d.column),
                    hints: d.hints,
                })
                .collect(),
            timed_out: outcome.timed_out,
            cancelled: outcome.cancelled,
            system_fonts_loaded: outcome.system_fonts_loaded,
        })
    }

    fn stage_file(&self, job_id: f64, name: String, data: ArrayBuffer) {
        compile::stage_file(job_id as u32, name, data.to_vec());
    }

    fn stage_font(&self, job_id: f64, data: ArrayBuffer) {
        compile::stage_font(job_id as u32, data.to_vec());
    }

    fn take_output(&self, job_id: f64) -> Result<ArrayBuffer, ModuleError> {
        compile::take_output(job_id as u32)
            .map(Into::into)
            .ok_or_else(|| failure("there is no output for this job"))
    }

    fn cancel(&self, job_id: f64) {
        compile::cancel(job_id as u32);
        compile::take_staged(job_id as u32);
        compile::take_output(job_id as u32);
    }

    async fn print(
        &self,
        pdf_path: String,
        options: TypstPrintOptions,
    ) -> Result<TypstPrintResult, ModuleError> {
        print(pdf_path, options).await
    }
}

#[cfg(target_os = "macos")]
async fn print(
    pdf_path: String,
    options: TypstPrintOptions,
) -> Result<TypstPrintResult, ModuleError> {
    print_macos::print(&pdf_path, &options)
}

#[cfg(not(target_os = "macos"))]
async fn print(
    _pdf_path: String,
    _options: TypstPrintOptions,
) -> Result<TypstPrintResult, ModuleError> {
    Err(ModuleError::with_code(
        "ERR_PRINT_UNSUPPORTED",
        "printing is not available on this platform yet",
    ))
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_typst_module::<Typst>());
}
