//! The Rust TurboModule fixture: every method shape the generated trait
//! supports, plus a module on the main thread.

rn_gpui_module::include_specs!();

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use rn_gpui_module::{ModuleError, ModuleThread, Value};

pub struct NativeFixture {
    events: NativeFixtureEvents,
    recorded: Mutex<Vec<String>>,
    calls: Mutex<u32>,
    js_thread: Mutex<Option<thread::ThreadId>>,
}

impl NativeFixtureSpec for NativeFixture {
    fn new(events: NativeFixtureEvents) -> Self {
        Self {
            events,
            recorded: Mutex::new(Vec::new()),
            calls: Mutex::new(0),
            js_thread: Mutex::new(None),
        }
    }

    fn greet(&self, name: String) -> Result<String, ModuleError> {
        Ok(format!("Autolinked Rust says hi to {name}."))
    }

    fn add(&self, a: f64, b: f64) -> Result<f64, ModuleError> {
        Ok(a + b)
    }

    fn summarize(&self, values: Vec<f64>, options: SummaryOptions) -> Result<Summary, ModuleError> {
        Ok(Summary {
            total: values.iter().sum(),
            label: options.label.unwrap_or_else(|| "unlabelled".to_string()),
            tags: options.tags,
        })
    }

    async fn greet_later(&self, name: String) -> Result<String, ModuleError> {
        Ok(format!("Later, {name}."))
    }

    async fn fail_later(&self, message: String) -> Result<String, ModuleError> {
        Err(ModuleError::with_code("E_FIXTURE", message))
    }

    async fn finish(&self) -> Result<(), ModuleError> {
        Ok(())
    }

    async fn ran_off_js_thread(&self) -> Result<bool, ModuleError> {
        let js_thread = *self.js_thread.lock().unwrap();
        Ok(js_thread.is_some_and(|id| id != thread::current().id()))
    }

    fn note_js_thread(&self) -> Result<bool, ModuleError> {
        *self.js_thread.lock().unwrap() = Some(thread::current().id());
        Ok(true)
    }

    async fn block_for(&self, ms: f64) -> Result<f64, ModuleError> {
        thread::sleep(Duration::from_millis(ms as u64));
        Ok(ms)
    }

    fn record(&self, value: String, tag: Option<String>) {
        self.recorded.lock().unwrap().push(match tag {
            Some(tag) => format!("{value}#{tag}"),
            None => value,
        });
    }

    fn recorded(&self) -> Result<Vec<String>, ModuleError> {
        Ok(self.recorded.lock().unwrap().clone())
    }

    fn next_count(&self) -> Result<f64, ModuleError> {
        let mut calls = self.calls.lock().unwrap();
        *calls += 1;
        Ok(f64::from(*calls))
    }

    fn lookup(&self, key: String, callback: Box<dyn FnOnce(String, bool) + Send>) {
        let found = key == "gpui";
        callback(
            if found {
                format!("value:{key}")
            } else {
                String::new()
            },
            found,
        );
    }

    async fn lookup_later(
        &self,
        key: String,
        callback: Box<dyn FnOnce(String, bool) + Send>,
    ) -> Result<String, ModuleError> {
        let found = key == "gpui";
        if found {
            callback(format!("later:{key}"), true);
        }
        // A callback that is dropped instead is released without a call.
        Ok(if found {
            "called".to_string()
        } else {
            "dropped".to_string()
        })
    }

    fn sum(&self, data: rn_gpui_module::ArrayBuffer) -> Result<f64, ModuleError> {
        Ok(data.iter().map(|byte| f64::from(*byte)).sum())
    }

    fn reversed(
        &self,
        data: rn_gpui_module::ArrayBuffer,
    ) -> Result<rn_gpui_module::ArrayBuffer, ModuleError> {
        let mut bytes = data.into_vec();
        bytes.reverse();
        Ok(bytes.into())
    }

    fn start_progress(&self, steps: f64) {
        for step in 1..=(steps as i32) {
            self.events.on_progress(f64::from(step));
        }
        self.events.on_done();
        self.events.send_event(
            "fixtureTick",
            Value::Object(vec![("n".into(), Value::Number(1.0))]),
        );
    }

    fn add_listener(&self, _event_name: String) {}

    fn remove_listeners(&self, _count: f64) {}
}

pub struct NativeMainFixture {
    ran: AtomicBool,
}

impl NativeMainFixtureSpec for NativeMainFixture {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeMainFixtureEvents) -> Self {
        Self {
            ran: AtomicBool::new(false),
        }
    }

    async fn ran_on_main_thread(&self) -> Result<bool, ModuleError> {
        self.ran.store(true, Ordering::SeqCst);
        Ok(rn_gpui_module::is_main_thread())
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_fixture_module::<NativeFixture>());
    rn_gpui_module::register(native_main_fixture_module::<NativeMainFixture>());
}
