//! `App`: the running application as a whole: its launch arguments, quitting
//! and relaunching.

use rn_gpui_module::{ModuleError, ModuleThread};

use crate::builtins::main_thread::on_main;
use crate::builtins::rn_gpui_specs::{NativeGpuiAppEvents, NativeGpuiAppSpec};

struct AppModule;

impl NativeGpuiAppSpec for AppModule {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeGpuiAppEvents) -> Self {
        Self
    }

    fn launch_args(&self) -> Result<Vec<String>, ModuleError> {
        Ok(std::env::args().skip(1).collect())
    }

    async fn quit(&self) -> Result<(), ModuleError> {
        on_main(|cx| cx.quit()).await
    }

    async fn exit(&self, code: f64) -> Result<(), ModuleError> {
        std::process::exit(code as i32)
    }

    async fn relaunch(&self) -> Result<(), ModuleError> {
        let executable = std::env::current_exe()
            .map_err(|error| ModuleError::new(format!("the executable is unknown: {error}")))?;
        std::process::Command::new(executable)
            .args(std::env::args().skip(1))
            .spawn()
            .map_err(|error| ModuleError::new(format!("the app could not be started: {error}")))?;
        on_main(|cx| cx.quit()).await
    }

    fn add_listener(&self, _event_name: String) {}

    fn remove_listeners(&self, _count: f64) {}
}

pub fn register() {
    rn_gpui_module::register(crate::builtins::rn_gpui_specs::native_gpui_app_module::<
        AppModule,
    >());
}
