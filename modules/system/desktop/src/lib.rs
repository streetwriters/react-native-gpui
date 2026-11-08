rn_gpui_module::include_specs!();

mod login;
mod protection;
mod restart;

use rn_gpui_module::{ModuleError, ModuleThread};

pub struct System;

pub fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("ERR_SYSTEM", message.to_string())
}

pub fn unsupported(feature: &str) -> ModuleError {
    ModuleError::with_code(
        "ERR_UNSUPPORTED",
        format!("{feature} is not supported on this platform"),
    )
}

impl NativeSystemSpec for System {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeSystemEvents) -> Self {
        Self
    }

    async fn get_launch_at_login(&self) -> Result<bool, ModuleError> {
        login::is_enabled()
    }

    async fn set_launch_at_login(
        &self,
        enabled: bool,
        args: Vec<String>,
    ) -> Result<(), ModuleError> {
        login::set(enabled, &args)
    }

    async fn restart(&self, args: Option<Vec<String>>) -> Result<(), ModuleError> {
        restart::restart(args)
    }

    async fn set_content_protected(&self, enabled: bool) -> Result<(), ModuleError> {
        protection::set(enabled)
    }

    async fn is_content_protected(&self) -> Result<bool, ModuleError> {
        Ok(protection::is_enabled())
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_system_module::<System>());
}
