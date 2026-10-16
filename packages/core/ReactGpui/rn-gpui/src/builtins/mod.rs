//! The built-in platform services React Native's own JS imports by name:
//! `AlertManager`, `Clipboard` and `LinkingManager`.
//!
//! They are Rust TurboModules like any module crate's, but they stay in core
//! because they are part of the platform rather than an optional package.
//!
//! `ModuleThread::Main` runs a job on the main thread, but it does not hand it
//! the `gpui::App`, so each service posts its work with `post_to_main` and
//! awaits the result here, exactly as the desktop-shell module does.

pub mod image;

use futures::channel::oneshot;
use gpui::{App, AppContext};
use rn_gpui_module::{ModuleError, ModuleThread, Value};

rn_gpui_module::include_specs!();

/// Runs `command` on the GPUI main thread and returns what it produced.
async fn on_main<T: Send + 'static>(
    command: impl FnOnce(&mut App) -> T + Send + 'static,
) -> Result<T, ModuleError> {
    let (sender, receiver) = oneshot::channel();
    crate::desktop::post_to_main(Box::new(move |cx| {
        let _ = sender.send(command(cx));
    }));
    receiver
        .await
        .map_err(|_| ModuleError::new("the desktop shell is not running"))
}

/// The labels JS asked for, in order. JS sends each button as a one-key object
/// (`{ "0": "Cancel" }`); a plain string is accepted too.
fn button_labels(buttons: Option<Vec<Value>>) -> Vec<String> {
    let Some(buttons) = buttons else {
        return Vec::new();
    };
    let mut labels: Vec<(usize, String)> = buttons
        .into_iter()
        .enumerate()
        .filter_map(|(position, button)| match button {
            Value::String(text) => Some((position, text)),
            Value::Object(fields) => fields.iter().find_map(|(key, value)| match value {
                Value::String(text) => Some((key.parse().unwrap_or(position), text.clone())),
                _ => None,
            }),
            _ => None,
        })
        .collect();
    labels.sort_by_key(|(position, _)| *position);
    labels.into_iter().map(|(_, text)| text).collect()
}

pub struct AlertManagerModule;

impl NativeGpuiAlertManagerSpec for AlertManagerModule {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeGpuiAlertManagerEvents) -> Self {
        Self
    }

    /// The callback takes the index of the button that was pressed, which is
    /// how React Native's own `Alert.prompt` finds the handler to call.
    fn alert_with_args(&self, args: AlertArgs, callback: Box<dyn FnOnce(f64, String) + Send>) {
        let title = args.title.unwrap_or_default();
        let message = args.message.unwrap_or_default();
        let mut buttons = button_labels(args.buttons);
        if buttons.is_empty() {
            buttons.push("OK".to_string());
        }
        let answers: Vec<gpui::PromptButton> = buttons
            .iter()
            .map(|button| gpui::PromptButton::new(button.clone()))
            .collect();
        crate::desktop::post_to_main(Box::new(move |cx| {
            let store = match cx.try_global::<crate::store::StoreGlobal>() {
                Some(store) => store.0.clone(),
                None => {
                    callback(0.0, String::new());
                    return;
                }
            };
            let mut window = None;
            store.update(cx, |store, _cx| window = Some(store.window));
            let Some(window) = window else {
                callback(0.0, String::new());
                return;
            };
            let receiver = cx.update_window(window, move |_root, window, cx| {
                window.prompt(
                    gpui::PromptLevel::Info,
                    &title,
                    (!message.is_empty()).then_some(message.as_str()),
                    &answers,
                    cx,
                )
            });
            match receiver {
                Ok(receiver) => {
                    cx.spawn(async move |_cx| {
                        let index = receiver.await.unwrap_or(0);
                        callback(index as f64, String::new());
                    })
                    .detach();
                }
                Err(_) => callback(0.0, String::new()),
            }
        }));
    }
}

pub struct ClipboardModule;

impl NativeGpuiClipboardSpec for ClipboardModule {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeGpuiClipboardEvents) -> Self {
        Self
    }

    fn get_constants(&self) -> Result<GetConstantsResult, ModuleError> {
        Ok(GetConstantsResult {})
    }

    async fn get_string(&self) -> Result<String, ModuleError> {
        on_main(|cx| {
            cx.read_from_clipboard()
                .and_then(|item| item.text())
                .unwrap_or_default()
        })
        .await
    }

    fn set_string(&self, content: String) {
        crate::desktop::post_to_main(Box::new(move |cx| {
            cx.write_to_clipboard(gpui::ClipboardItem::new_string(content));
        }));
    }
}

pub struct LinkingManagerModule;

impl NativeGpuiLinkingManagerSpec for LinkingManagerModule {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeGpuiLinkingManagerEvents) -> Self {
        Self
    }

    async fn get_initial_url(&self) -> Result<Option<String>, ModuleError> {
        Ok(None)
    }

    async fn can_open_url(&self, url: String) -> Result<bool, ModuleError> {
        let scheme = url
            .split_once(':')
            .map(|(scheme, _)| scheme.to_ascii_lowercase())
            .unwrap_or_default();
        Ok(matches!(
            scheme.as_str(),
            "http" | "https" | "mailto" | "tel"
        ))
    }

    async fn open_url(&self, url: String) -> Result<(), ModuleError> {
        on_main(move |cx| cx.open_url(&url)).await
    }

    async fn open_settings(&self) -> Result<(), ModuleError> {
        Err(ModuleError::new(
            "opening application settings is not supported by GPUI",
        ))
    }

    fn add_listener(&self, _event_name: String) {}

    fn remove_listeners(&self, _count: f64) {}
}

/// Registers every built-in the platform is responsible for.
pub fn register() {
    image::register();
    rn_gpui_module::register(native_gpui_alert_manager_module::<AlertManagerModule>());
    rn_gpui_module::register(native_gpui_clipboard_module::<ClipboardModule>());
    rn_gpui_module::register(native_gpui_linking_manager_module::<LinkingManagerModule>());
}
