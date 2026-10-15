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
use super::{app_menu, context_menu, menu_model, perf_monitor, tray, windows};

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

    async fn window_open(&self, options: WindowOpenOptions) -> Result<WindowHandle, ModuleError> {
        on_main("windowOpen", move |cx| {
            let always_on_top = options.always_on_top.unwrap_or(false);
            let open = windows::OpenWindowOptions {
                component: options.component,
                props: options
                    .props
                    .map(value_json)
                    .filter(|value| value.is_object()),
                title: options.title,
                width: options.width.map(|value| value as f32),
                height: options.height.map(|value| value as f32),
                x: options.x.map(|value| value as f32),
                y: options.y.map(|value| value as f32),
                resizable: options.resizable.unwrap_or(true),
                appears_transparent: options.title_bar.as_deref() == Some("transparent"),
                traffic_light_position: options
                    .traffic_light_position
                    .map(|position| (position.x as f32, position.y as f32)),
                role: windows::WindowRoleOverride::Secondary,
                popup: false,
            };
            let key = windows::open_window(cx, open)?;
            if always_on_top {
                windows::set_always_on_top(cx, key, true)?;
            }
            Ok(serde_json::json!({ "windowId": key }))
        })
        .await
    }

    async fn window_list(&self) -> Result<WindowList, ModuleError> {
        on_main("windowList", |cx| windows::list_windows(cx)).await
    }

    async fn window_get_state(&self, window_id: i32) -> Result<WindowState, ModuleError> {
        on_main("windowGetState", move |cx| {
            windows::window_state(cx, window_key(window_id))
        })
        .await
    }

    async fn window_close(&self, window_id: i32, force: bool) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::close(cx, window_key(window_id), force)).await
    }

    async fn window_focus(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::focus(cx, window_key(window_id))).await
    }

    async fn window_set_title(&self, window_id: i32, title: String) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::set_title(cx, window_key(window_id), title)).await
    }

    async fn window_set_size(
        &self,
        window_id: i32,
        width: f64,
        height: f64,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            windows::set_size(cx, window_key(window_id), width as f32, height as f32)
        })
        .await
    }

    async fn window_set_position(&self, window_id: i32, x: f64, y: f64) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::set_position(cx, window_key(window_id), x as f32, y as f32))
            .await
    }

    async fn window_set_min_size(
        &self,
        window_id: i32,
        width: f64,
        height: f64,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            windows::set_min_size(cx, window_key(window_id), width as f32, height as f32)
        })
        .await
    }

    async fn window_set_max_size(
        &self,
        window_id: i32,
        width: f64,
        height: f64,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            windows::set_max_size(cx, window_key(window_id), width as f32, height as f32)
        })
        .await
    }

    async fn window_set_resizable(
        &self,
        window_id: i32,
        resizable: bool,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::set_resizable(cx, window_key(window_id), resizable)).await
    }

    async fn window_set_fullscreen(
        &self,
        window_id: i32,
        fullscreen: bool,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::set_fullscreen(cx, window_key(window_id), fullscreen)).await
    }

    async fn window_set_always_on_top(
        &self,
        window_id: i32,
        on_top: bool,
    ) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::set_always_on_top(cx, window_key(window_id), on_top)).await
    }

    async fn window_minimize(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::minimize(cx, window_key(window_id))).await
    }

    async fn window_maximize(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::maximize(cx, window_key(window_id))).await
    }

    async fn window_unmaximize(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::unmaximize(cx, window_key(window_id))).await
    }

    async fn window_toggle_maximize(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::toggle_maximize(cx, window_key(window_id))).await
    }

    async fn window_show(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::show(cx, window_key(window_id))).await
    }

    async fn window_hide(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::hide(cx, window_key(window_id))).await
    }

    async fn window_start_dragging(&self, window_id: i32) -> Result<(), ModuleError> {
        on_main_void(move |cx| windows::start_dragging(cx, window_key(window_id))).await
    }

    async fn window_intercept_close(&self, window_id: i32, on: bool) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            let key = window_key(window_id);
            let entry = cx
                .global_mut::<windows::DesktopWindowsGlobal>()
                .0
                .get_mut(key)
                .ok_or_else(|| DesktopError::not_found(format!("window {key} is not open")))?;
            entry.intercept_close = on;
            Ok(serde_json::Value::Null)
        })
        .await
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

    async fn tray_install(&self, options: TrayOptions) -> Result<TrayHandle, ModuleError> {
        on_main("trayInstall", move |cx| {
            let mut config = tray::TrayConfig::default();
            if let Some(id) = options.id {
                config.id = id;
            }
            config.tooltip = options.tooltip;
            config.title = options.title;
            config.component = options.component;
            if let Some(size) = options.size {
                config = config.size(size.width as f32, size.height as f32);
            }
            if let Some(menu) = json_items(options.menu) {
                config.menu = Some(menu_model::parse_menu(&menu)?);
            }
            if let Some(on_left_click) = options.menu_on_left_click {
                config.menu_on_left_click = on_left_click;
            }
            if let Some(quit) = options.quit_on_last_window_closed {
                config.quit_on_last_window_closed = quit;
            }
            tray::install(cx, config)
        })
        .await
    }

    async fn tray_destroy(&self) -> Result<(), ModuleError> {
        on_main_void(tray::destroy).await
    }

    async fn tray_get_state(&self) -> Result<TrayState, ModuleError> {
        on_main("trayGetState", |cx| Ok(tray::state(cx))).await
    }

    async fn tray_set_tooltip(&self, tooltip: Option<String>) -> Result<(), ModuleError> {
        on_main_void(move |cx| tray::set_tooltip(cx, tooltip.as_deref())).await
    }

    async fn tray_set_visible(&self, visible: bool) -> Result<(), ModuleError> {
        on_main_void(move |cx| tray::set_visible(cx, visible)).await
    }

    async fn tray_set_icon(&self, path: String) -> Result<(), ModuleError> {
        on_main_void(move |cx| tray::set_icon(cx, &path)).await
    }

    async fn tray_set_menu(&self, items: Option<Vec<Value>>) -> Result<(), ModuleError> {
        on_main_void(move |cx| {
            let items = json_items(items);
            tray::set_menu(cx, items.as_ref())
        })
        .await
    }

    async fn perf_monitor_set_enabled(&self, enabled: bool) -> Result<PerfToggle, ModuleError> {
        on_main("perfMonitorSetEnabled", move |cx| {
            Ok(perf_monitor::set_enabled(cx, enabled))
        })
        .await
    }

    async fn perf_monitor_get_metrics(&self) -> Result<PerfMetrics, ModuleError> {
        on_main("perfMonitorGetMetrics", |cx| Ok(perf_monitor::metrics(cx))).await
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
