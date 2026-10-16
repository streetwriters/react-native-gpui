//! The desktop-shell TurboModule: one method per command in
//! `src-gpui/src/private/specs/NativeGpuiDesktop.ts`.
//!
//! A command needs the GPUI app context, which only the main loop holds, so
//! each one is posted to the main thread and awaited here. The value methods
//! (`capabilities`, `platform`, `appId`) read immutable state and run inline on
//! the JS thread, which is what makes them synchronous.

use futures::channel::oneshot;
use gpui::App;
use rn_gpui_module::{FromValue, IntoValue, ModuleError, ModuleThread, Path, Value};

use super::capabilities;
use super::errors::{DesktopError, DesktopResult};
use super::{app_menu, context_menu, menu_model, tray, windows};

rn_gpui_module::include_specs!();

/// The module name the spec registers, used to name conversion errors.
const MODULE: &str = "GpuiDesktop";

pub struct GpuiDesktopModule;

fn window_key(window_id: i32) -> u32 {
    window_id as u32
}

fn module_error(error: DesktopError) -> ModuleError {
    ModuleError::with_code(error.code, error.message)
}

/// The JSON the desktop internals produce, as a module value.
fn json_value(value: &serde_json::Value) -> Value {
    match value {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(flag) => Value::Bool(*flag),
        serde_json::Value::Number(number) => Value::Number(number.as_f64().unwrap_or_default()),
        serde_json::Value::String(text) => Value::String(text.clone()),
        serde_json::Value::Array(items) => Value::Array(items.iter().map(json_value).collect()),
        serde_json::Value::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, item)| (key.clone(), json_value(item)))
                .collect(),
        ),
    }
}

/// A module value as the JSON the desktop internals take.
fn value_json(value: Value) -> serde_json::Value {
    match value {
        Value::Null | Value::Callback(_) => serde_json::Value::Null,
        Value::Bool(flag) => serde_json::Value::Bool(flag),
        Value::Number(number) => serde_json::Number::from_f64(number)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Value::String(text) => serde_json::Value::String(text),
        Value::Buffer(bytes) => serde_json::Value::Array(
            bytes
                .into_iter()
                .map(|byte| serde_json::Value::Number(byte.into()))
                .collect(),
        ),
        Value::Array(items) => {
            serde_json::Value::Array(items.into_iter().map(value_json).collect())
        }
        Value::Object(fields) => serde_json::Value::Object(
            fields
                .into_iter()
                .map(|(key, item)| (key, value_json(item)))
                .collect(),
        ),
    }
}

fn json_items(items: Option<Vec<Value>>) -> Option<serde_json::Value> {
    items.map(|items| serde_json::Value::Array(items.into_iter().map(value_json).collect()))
}

/// Converts a result the desktop internals built as JSON into the spec's type.
fn typed<T: FromValue>(method: &'static str, result: DesktopResult) -> Result<T, DesktopError> {
    let value = json_value(&result?);
    let mut path = Path::result(MODULE, method);
    T::from_value(value, &mut path).map_err(|error| DesktopError::failed(error.message))
}

/// Runs `command` on the GPUI main thread and converts what it returns.
async fn on_main<T: FromValue>(
    method: &'static str,
    command: impl FnOnce(&mut App) -> DesktopResult + Send + 'static,
) -> Result<T, ModuleError> {
    let (sender, receiver) = oneshot::channel();
    super::post_to_main(Box::new(move |cx| {
        let _ = sender.send(command(cx));
    }));
    let result = receiver
        .await
        .map_err(|_| ModuleError::new("the desktop shell is not running"))?;
    typed(method, result).map_err(module_error)
}

/// The same, for a command whose value the spec discards.
async fn on_main_void(
    command: impl FnOnce(&mut App) -> DesktopResult + Send + 'static,
) -> Result<(), ModuleError> {
    let (sender, receiver) = oneshot::channel();
    super::post_to_main(Box::new(move |cx| {
        let _ = sender.send(command(cx));
    }));
    let result = receiver
        .await
        .map_err(|_| ModuleError::new("the desktop shell is not running"))?;
    result.map(|_| ()).map_err(module_error)
}

/// Runs a command that answers later, such as a context menu, and awaits its
/// value.
async fn on_main_deferred<T: FromValue>(
    method: &'static str,
    command: impl FnOnce(&mut App, context_menu::Reply) + Send + 'static,
) -> Result<T, ModuleError> {
    let (sender, receiver) = oneshot::channel();
    super::post_to_main(Box::new(move |cx| command(cx, sender)));
    let result = receiver
        .await
        .map_err(|_| ModuleError::new("the command was dismissed"))?;
    typed(method, result).map_err(module_error)
}

impl NativeGpuiDesktopSpec for GpuiDesktopModule {
    /// Every command runs where the GPUI app context is.
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeGpuiDesktopEvents) -> Self {
        Self
    }

    fn capabilities(&self) -> Result<DesktopCapabilities, ModuleError> {
        Ok(DesktopCapabilities {
            native_app_menu: capabilities::native_app_menu(),
            native_context_menu: capabilities::native_context_menu(),
            tray: capabilities::tray(),
            tray_popover_anchored: capabilities::tray_popover_anchored(),
            window_position: capabilities::window_position(),
            always_on_top: capabilities::always_on_top(),
            transparent_titlebar: capabilities::transparent_titlebar(),
        })
    }

    fn platform(&self) -> Result<String, ModuleError> {
        Ok(super::snapshot_platform())
    }

    fn app_id(&self) -> Result<String, ModuleError> {
        Ok(super::snapshot_app_id())
    }

    async fn app_info(&self) -> Result<DesktopAppInfo, ModuleError> {
        Ok(DesktopAppInfo {
            platform: super::snapshot_platform(),
            arch: std::env::consts::ARCH.to_string(),
            capabilities: self.capabilities()?,
        })
    }

    async fn menu_set_application_menu(
        &self,
        items: Option<Vec<Value>>,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            app_menu::set_application_menu(cx, json_items(items).as_ref())?;
            Ok(serde_json::Value::Null)
        })
        .await
    }

    async fn menu_update(&self, id: String, patch: MenuItemPatch) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            app_menu::update_item(cx, &id, &value_json(patch.into_value()))?;
            Ok(serde_json::Value::Null)
        })
        .await
    }

    async fn menu_get(&self) -> Result<MenuDescription, ModuleError> {
        on_main("menuGet", |cx| Ok(app_menu::menu_json(cx))).await
    }

    async fn context_menu_show(
        &self,
        items: Vec<Value>,
        options: ContextMenuOptions,
    ) -> Result<ContextMenuSelection, ModuleError> {
        let items = serde_json::Value::Array(items.into_iter().map(value_json).collect());
        on_main_deferred("contextMenuShow", move |cx, reply| {
            let responder = context_menu::Responder::desktop(reply);
            let rejected = responder.clone();
            if let Err(error) = context_menu::show(
                cx,
                items,
                options.x,
                options.y,
                options.window_id.map(window_key),
                responder,
            ) {
                rejected.reject(error);
            }
        })
        .await
    }

    fn add_listener(&self, _event_name: String) {}

    fn remove_listeners(&self, _count: f64) {}
}

/// Registers the desktop module. Called once, before the first JS runtime.
pub fn register() {
    rn_gpui_module::register(native_gpui_desktop_module::<GpuiDesktopModule>());
}
