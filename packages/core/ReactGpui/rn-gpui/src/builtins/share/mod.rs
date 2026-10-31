//! `Share`: the system share sheet on macOS, and a small dialog on the systems
//! that have no sheet: copy to the clipboard or send by email.

use rn_gpui_module::{ModuleError, ModuleThread};

use crate::builtins::main_thread::on_main;
use crate::builtins::rn_gpui_specs::{
    NativeGpuiShareEvents, NativeGpuiShareSpec, ShareItems, ShareResult,
};

#[cfg(target_os = "macos")]
pub(crate) mod mac;

struct ShareModule;

/// What goes on the clipboard when there is no share sheet.
fn clipboard_text(message: Option<&str>, url: Option<&str>) -> String {
    match (message, url) {
        (Some(message), Some(url)) if !message.contains(url) => format!("{message}\n{url}"),
        (Some(message), _) => message.to_string(),
        (None, Some(url)) => url.to_string(),
        (None, None) => String::new(),
    }
}

/// `mailto:` for the content, with the subject and body percent-encoded.
#[cfg_attr(target_os = "macos", allow(dead_code))]
fn mailto(subject: Option<&str>, body: &str) -> String {
    fn encode(text: &str) -> String {
        let mut out = String::new();
        for byte in text.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    out.push(byte as char)
                }
                _ => out.push_str(&format!("%{byte:02X}")),
            }
        }
        out
    }
    match subject {
        Some(subject) => format!("mailto:?subject={}&body={}", encode(subject), encode(body)),
        None => format!("mailto:?body={}", encode(body)),
    }
}

/// The window rectangle `(x, y, width, height)` of the node with this tag.
#[cfg(target_os = "macos")]
fn anchor_rect(cx: &gpui::App, tag: i32) -> Option<(f32, f32, f32, f32)> {
    let store = crate::store::store_from(cx)?;
    let entity = store.read(cx).nodes.get(&tag)?.clone();
    let node = entity.read(cx);
    let origin = node.absolute_origin(cx);
    let (scale_x, scale_y) = node.cumulative_scale(cx);
    Some((
        f32::from(origin.x),
        f32::from(origin.y),
        node.frame.w * scale_x,
        node.frame.h * scale_y,
    ))
}

impl NativeGpuiShareSpec for ShareModule {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(_events: NativeGpuiShareEvents) -> Self {
        Self
    }

    async fn share(&self, items: ShareItems) -> Result<ShareResult, ModuleError> {
        let (sender, receiver) = futures::channel::oneshot::channel();
        let sender = std::sync::Mutex::new(Some(sender));
        let message = items.message.clone();
        let url = items.url.clone();
        let subject = items.subject.clone();
        let anchor_tag = items.anchor.map(|tag| tag as i32);
        let _ = on_main(move |cx| {
            let finish = move |activity: Option<String>| {
                if let Some(sender) = sender.lock().expect("share sender poisoned").take() {
                    let _ = sender.send(activity);
                }
            };
            #[cfg(target_os = "macos")]
            {
                use gpui::AppContext as _;
                let mut finish = Some(finish);
                let window = cx
                    .try_global::<crate::store::StoreGlobal>()
                    .map(|store| store.0.clone())
                    .map(|store| store.read(cx).window);
                let anchor = anchor_tag.and_then(|tag| anchor_rect(cx, tag));
                let shown = window.and_then(|window| {
                    cx.update_window(window, |_root, window, _cx| {
                        mac::present(
                            window,
                            message.clone(),
                            url.clone(),
                            anchor,
                            Box::new(finish.take().expect("finish taken once")),
                        );
                    })
                    .ok()
                });
                if shown.is_none() {
                    if let Some(finish) = finish {
                        finish(None);
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = anchor_tag;
                let text = clipboard_text(message.as_deref(), url.as_deref());
                let request = crate::builtins::alert::Request {
                    title: subject.clone().unwrap_or_else(|| "Share".to_string()),
                    message: Some(text.clone()).filter(|text| !text.is_empty()),
                    buttons: vec![
                        ("copy".to_string(), "Copy".to_string()),
                        ("email".to_string(), "Email".to_string()),
                        ("cancel".to_string(), "Cancel".to_string()),
                    ],
                    cancel: Some(2),
                    destructive: None,
                    preferred: Some(0),
                    cancelable: true,
                    input: crate::builtins::alert::Input::None,
                    default_value: String::new(),
                    dark: None,
                };
                crate::builtins::alert::dialog::present(
                    cx,
                    request,
                    Box::new(move |outcome| {
                        use crate::builtins::alert::Outcome;
                        let Outcome::Button { position, .. } = outcome else {
                            return finish(None);
                        };
                        crate::desktop::post_to_main(Box::new(move |cx: &mut gpui::App| {
                            match position {
                                0 => {
                                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(text));
                                    finish(Some("copy".to_string()));
                                }
                                1 => {
                                    cx.open_url(&mailto(subject.as_deref(), &text));
                                    finish(Some("email".to_string()));
                                }
                                _ => finish(None),
                            }
                        }));
                    }),
                );
            }
        })
        .await?;
        let activity = receiver
            .await
            .map_err(|_| ModuleError::new("the share sheet was closed"))?;
        Ok(match activity {
            Some(activity_type) => ShareResult {
                action: "sharedAction".to_string(),
                activity_type: Some(activity_type),
            },
            None => ShareResult {
                action: "dismissedAction".to_string(),
                activity_type: None,
            },
        })
    }
}

pub fn register() {
    rn_gpui_module::register(crate::builtins::rn_gpui_specs::native_gpui_share_module::<
        ShareModule,
    >());
}

#[cfg(test)]
mod tests {
    use super::{clipboard_text, mailto};

    #[test]
    fn the_mail_link_encodes_the_subject_and_body() {
        assert_eq!(
            mailto(Some("A & B"), "hi\nhttps://x/?a=1"),
            "mailto:?subject=A%20%26%20B&body=hi%0Ahttps%3A%2F%2Fx%2F%3Fa%3D1"
        );
        assert_eq!(mailto(None, "é"), "mailto:?body=%C3%A9");
    }

    #[test]
    fn the_clipboard_gets_the_message_and_the_link_once() {
        assert_eq!(
            clipboard_text(Some("hi"), Some("https://x")),
            "hi\nhttps://x"
        );
        assert_eq!(
            clipboard_text(Some("see https://x"), Some("https://x")),
            "see https://x"
        );
        assert_eq!(clipboard_text(None, Some("https://x")), "https://x");
        assert_eq!(clipboard_text(Some("hi"), None), "hi");
    }
}
