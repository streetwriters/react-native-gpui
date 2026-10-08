//! Native context menus (plan item 7.2, §6.3).
//!
//! macOS and Windows use `muda`: an `NSMenu` shown for the window's `NSView`,
//! or a Win32 popup menu on the HWND. Selection arrives on muda's global menu
//! event channel after the (blocking) call returns; no event means the menu was
//! dismissed, which resolves `null`.
//!
//! Presenters sit behind [`ContextMenuPresenter`] so the test driver can swap in
//! a recording fake: a native popup runs a modal tracking loop the driver cannot
//! click through, and the fake goes through the same model, event and callback
//! path as the real one.

use crate::desktop::errors::DesktopError;
use crate::desktop::menu_model::{self, MenuModel, MenuNode};
use crate::desktop::windows::DesktopWindowsGlobal;
use gpui::{AnyWindowHandle, App};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::rc::Rc;

/// One `ContextMenu.show` request.
pub struct ContextMenuRequest {
    pub window: AnyWindowHandle,
    /// Window points, the same space as `pageX`/`pageY`.
    pub x: f32,
    pub y: f32,
    pub model: MenuModel,
    /// macOS: the window's `NSView`. Windows: the window's `HWND`.
    pub native_view: isize,
}

/// Settles the caller. Exactly one of `resolve`/`reject` is called.
#[derive(Clone)]
pub enum Responder {
    /// Settles the JS promise behind `ContextMenu.show`.
    Desktop { request_id: i32 },
    /// An internal caller (the Dev Menu, a tray menu).
    Callback(Rc<RefCell<Option<Box<dyn FnMut(Option<String>)>>>>),
}

impl Responder {
    pub fn desktop(request_id: i32) -> Self {
        Self::Desktop { request_id }
    }

    pub fn callback(callback: Box<dyn FnMut(Option<String>)>) -> Self {
        Self::Callback(Rc::new(RefCell::new(Some(callback))))
    }

    /// Resolve with the chosen item id, or `null` when the menu was dismissed.
    pub fn resolve(&self, selection: Option<&str>) {
        match self {
            Self::Desktop { request_id } => rn_gpui_sys::ffi::rn_gpui_desktop_result(
                *request_id,
                true,
                json!({"id": selection}).to_string(),
            ),
            Self::Callback(callback) => {
                if let Some(mut callback) = callback.borrow_mut().take() {
                    callback(selection.map(str::to_string));
                }
            }
        }
    }

    pub fn reject(&self, error: DesktopError) {
        match self {
            Self::Desktop { request_id } => {
                rn_gpui_sys::ffi::rn_gpui_desktop_result(*request_id, false, error.to_json());
            }
            Self::Callback(callback) => {
                if let Some(mut callback) = callback.borrow_mut().take() {
                    callback(None);
                }
            }
        }
    }
}

/// The window a menu without a caller-supplied window targets: the active one,
/// else the main window (a hidden or off-screen window is not "active").
pub fn target_window(cx: &mut App) -> Result<(AnyWindowHandle, isize), DesktopError> {
    let window = cx
        .active_window()
        .or_else(|| {
            cx.global::<DesktopWindowsGlobal>()
                .0
                .get(crate::desktop::windows::MAIN_WINDOW_KEY)
                .map(|entry| entry.handle)
        })
        .ok_or_else(|| DesktopError::failed("no window for the context menu"))?;
    let native_view = native_view_of(cx, window);
    Ok((window, native_view))
}

/// Presents a context menu and settles the request.
pub trait ContextMenuPresenter: 'static {
    fn show(&self, cx: &mut App, request: ContextMenuRequest, responder: Responder);
}

pub struct ContextMenuPresenterGlobal(pub Rc<dyn ContextMenuPresenter>);
impl gpui::Global for ContextMenuPresenterGlobal {}

/// Install the presenter. With the test-driver feature and
/// `RN_GPUI_TEST_FAKE_NATIVE_UI=1` this is the recording fake.
pub fn install(cx: &mut App) {
    let fake = cfg!(feature = "test-driver")
        && std::env::var("RN_GPUI_TEST_FAKE_NATIVE_UI").as_deref() == Ok("1");
    if fake {
        let fake = Rc::new(FakeContextMenu::new());
        cx.set_global(FakeContextMenuGlobal(fake.clone()));
        cx.set_global(ContextMenuPresenterGlobal(fake));
    } else {
        cx.set_global(ContextMenuPresenterGlobal(Rc::new(NativeContextMenu)));
    }
}

/// `ContextMenu.show(items, {x, y, windowId})`.
///
/// Answers validation errors immediately and leaves the promise pending on
/// success: the presenter settles it when the menu closes.
pub fn show(cx: &mut App, request_id: i32, args_json: &str) -> Result<(), DesktopError> {
    let args: Value = serde_json::from_str(args_json)
        .map_err(|error| DesktopError::invalid_argument(format!("invalid args JSON: {error}")))?;
    let object = args
        .as_object()
        .ok_or_else(|| DesktopError::invalid_argument("args must be a JSON object"))?;
    let items = object
        .get("items")
        .ok_or_else(|| DesktopError::invalid_argument("ContextMenu.show requires items"))?;
    let model = menu_model::parse_menu(items)?;
    let window = match object.get("windowId").and_then(Value::as_u64) {
        Some(key) => cx
            .global::<DesktopWindowsGlobal>()
            .0
            .get(key as u32)
            .map(|entry| entry.handle)
            .ok_or_else(|| DesktopError::not_found(format!("window {key} is not open")))?,
        // A hidden or off-screen window is not the platform's active window, so
        // fall back to the main window rather than failing.
        None => cx
            .active_window()
            .or_else(|| {
                cx.global::<DesktopWindowsGlobal>()
                    .0
                    .get(crate::desktop::windows::MAIN_WINDOW_KEY)
                    .map(|entry| entry.handle)
            })
            .ok_or_else(|| DesktopError::failed("no window for the context menu"))?,
    };
    let native_view = native_view_of(cx, window);
    let (x, y) = match (
        object.get("x").and_then(Value::as_f64),
        object.get("y").and_then(Value::as_f64),
    ) {
        (Some(x), Some(y)) => (x as f32, y as f32),
        _ => cursor_position(cx, window),
    };
    let request = ContextMenuRequest {
        window,
        x,
        y,
        model,
        native_view,
    };
    let responder = Responder::desktop(request_id);
    let presenter = cx.global::<ContextMenuPresenterGlobal>().0.clone();
    presenter.show(cx, request, responder);
    Ok(())
}

/// The window's platform view pointer, for the native presenter.
fn native_view_of(cx: &mut App, window: AnyWindowHandle) -> isize {
    window
        .update(cx, |_root, window, _cx| raw_view(window))
        .unwrap_or(0)
}

#[cfg(target_os = "macos")]
fn raw_view(window: &gpui::Window) -> isize {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    match HasWindowHandle::window_handle(window) {
        Ok(handle) => match handle.as_raw() {
            RawWindowHandle::AppKit(appkit) => appkit.ns_view.as_ptr() as isize,
            _ => 0,
        },
        Err(_) => 0,
    }
}

#[cfg(target_os = "windows")]
fn raw_view(window: &gpui::Window) -> isize {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    match HasWindowHandle::window_handle(window) {
        Ok(handle) => match handle.as_raw() {
            RawWindowHandle::Win32(win32) => win32.hwnd.get() as isize,
            _ => 0,
        },
        Err(_) => 0,
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn raw_view(_window: &gpui::Window) -> isize {
    0
}

/// The pointer position in window points, when the caller did not pass one.
fn cursor_position(cx: &mut App, window: AnyWindowHandle) -> (f32, f32) {
    window
        .update(cx, |_root, window, _cx| {
            let position = window.mouse_position();
            (f32::from(position.x), f32::from(position.y))
        })
        .unwrap_or((0.0, 0.0))
}

/// The real presenter: `muda` on macOS and Windows.
struct NativeContextMenu;

impl ContextMenuPresenter for NativeContextMenu {
    fn show(&self, cx: &mut App, request: ContextMenuRequest, responder: Responder) {
        // The native call runs a modal tracking loop, so it is deferred: GPUI
        // must not be inside an update while the menu is open.
        cx.defer(move |_cx| {
            if let Err(error) = native_show(&request, &responder) {
                responder.reject(error);
            }
        });
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn native_show(request: &ContextMenuRequest, responder: &Responder) -> Result<(), DesktopError> {
    use muda::ContextMenu as _;

    let menu = muda::Menu::new();
    build_muda_menu(&menu, &request.model.items)?;
    // A previous menu's event must not answer this one.
    while muda::MenuEvent::receiver().try_recv().is_ok() {}
    let position = muda::dpi::Position::Logical(muda::dpi::LogicalPosition::new(
        request.x as f64,
        request.y as f64,
    ));
    if request.native_view == 0 {
        return Err(DesktopError::failed(
            "the window has no platform view for a context menu",
        ));
    }
    #[cfg(target_os = "macos")]
    unsafe {
        menu.show_context_menu_for_nsview(
            request.native_view as *const std::ffi::c_void,
            Some(position),
        )
    };
    #[cfg(target_os = "windows")]
    unsafe {
        menu.show_context_menu_for_hwnd(request.native_view, Some(position))
    };
    let selection = muda::MenuEvent::receiver()
        .try_recv()
        .ok()
        .map(|event| event.id.0.to_string());
    responder.resolve(selection.as_deref());
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn native_show(_request: &ContextMenuRequest, _responder: &Responder) -> Result<(), DesktopError> {
    Err(DesktopError::unsupported(
        "native context menus are not implemented on this platform yet",
    ))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
/// `Menu` and `Submenu` both append items, but the `ContextMenu` trait does not
/// cover it, so the builder is generic over this.
trait MudaAppend {
    fn append_all(&self, items: &[&dyn muda::IsMenuItem]) -> muda::Result<()>;
}

impl MudaAppend for muda::Menu {
    fn append_all(&self, items: &[&dyn muda::IsMenuItem]) -> muda::Result<()> {
        self.append_items(items)
    }
}

impl MudaAppend for muda::Submenu {
    fn append_all(&self, items: &[&dyn muda::IsMenuItem]) -> muda::Result<()> {
        self.append_items(items)
    }
}

fn build_muda_menu(menu: &impl MudaAppend, items: &[MenuNode]) -> Result<(), DesktopError> {
    use muda::{CheckMenuItem, MenuItem, PredefinedMenuItem, Submenu};

    let mut children: Vec<Box<dyn muda::IsMenuItem>> = Vec::new();
    for node in items {
        match node {
            MenuNode::Separator => {
                children.push(Box::new(PredefinedMenuItem::separator()));
            }
            MenuNode::StandardMenu(_) => {
                // A whole standard submenu has no meaning inside a context
                // menu; its individual roles are what an app asks for.
            }
            MenuNode::Item(item) => {
                if item.checked {
                    children.push(Box::new(CheckMenuItem::with_id(
                        item.id.clone(),
                        item.label.clone(),
                        item.enabled,
                        true,
                        None,
                    )));
                } else {
                    children.push(Box::new(MenuItem::with_id(
                        item.id.clone(),
                        item.label.clone(),
                        item.enabled,
                        None,
                    )));
                }
            }
            MenuNode::Submenu(submenu) => {
                let child = Submenu::new(submenu.label.clone(), submenu.enabled);
                build_muda_menu(&child, &submenu.items)?;
                children.push(Box::new(child));
            }
        }
    }
    let refs: Vec<&dyn muda::IsMenuItem> = children.iter().map(|item| item.as_ref()).collect();
    menu.append_all(&refs)
        .map_err(|error| DesktopError::failed(format!("could not build the context menu: {error}")))
}

/// The recording fake used by the test driver (plan §3.5).
pub struct FakeContextMenu {
    state: RefCell<FakeContextMenuState>,
}

#[derive(Default)]
struct FakeContextMenuState {
    model: Option<Value>,
    responder: Option<Responder>,
    position: (f32, f32),
    shown: u32,
}

pub struct FakeContextMenuGlobal(pub Rc<FakeContextMenu>);
impl gpui::Global for FakeContextMenuGlobal {}

impl FakeContextMenu {
    pub fn new() -> Self {
        Self {
            state: RefCell::new(FakeContextMenuState::default()),
        }
    }
}

impl ContextMenuPresenter for FakeContextMenu {
    fn show(&self, _cx: &mut App, request: ContextMenuRequest, responder: Responder) {
        let mut state = self.state.borrow_mut();
        // A second show dismisses the first with `null`.
        if let Some(previous) = state.responder.take() {
            previous.resolve(None);
        }
        state.model = Some(json!({"items": nodes_json(&request.model.items)}));
        state.position = (request.x, request.y);
        state.shown += 1;
        state.responder = Some(responder);
    }
}

/// A menu model as JSON, the shape `getContextMenu` reports.
pub fn nodes_json(items: &[MenuNode]) -> Vec<Value> {
    items
        .iter()
        .map(|node| match node {
            MenuNode::Separator => json!({"type": "separator"}),
            MenuNode::StandardMenu(role) => json!({"type": "role", "role": format!("{role:?}")}),
            MenuNode::Submenu(submenu) => json!({
                "type": "submenu",
                "id": submenu.id,
                "label": submenu.label,
                "enabled": submenu.enabled,
                "items": nodes_json(&submenu.items),
            }),
            MenuNode::Item(item) => json!({
                "type": "item",
                "id": item.id,
                "label": item.label,
                "enabled": item.enabled,
                "checked": item.checked,
            }),
        })
        .collect()
}

/// The model the fake recorded, for `getContextMenu`.
pub fn fake_model(cx: &App) -> Option<Value> {
    let fake = cx.try_global::<FakeContextMenuGlobal>()?;
    let state = fake.0.state.borrow();
    Some(json!({
        "items": state.model.as_ref().and_then(|value| value.get("items")).cloned().unwrap_or(Value::Null),
        "x": state.position.0,
        "y": state.position.1,
        "shown": state.shown,
    }))
}

/// `selectContextMenuItem {id}` for the fake.
pub fn fake_select(cx: &App, id: &str) -> bool {
    let Some(fake) = cx.try_global::<FakeContextMenuGlobal>() else {
        return false;
    };
    let responder = fake.0.state.borrow_mut().responder.take();
    match responder {
        Some(responder) => {
            responder.resolve(Some(id));
            true
        }
        None => false,
    }
}

/// `dismissContextMenu` for the fake.
pub fn fake_dismiss(cx: &App) -> bool {
    let Some(fake) = cx.try_global::<FakeContextMenuGlobal>() else {
        return false;
    };
    let responder = fake.0.state.borrow_mut().responder.take();
    match responder {
        Some(responder) => {
            responder.resolve(None);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_a_malformed_model_before_presenting() {
        let error = menu_model::parse_menu(&json!([{"id": "a"}])).expect_err("label is required");
        assert_eq!(error.code, crate::desktop::errors::codes::INVALID_ARGUMENT);
    }

    #[test]
    fn nodes_json_keeps_ids_and_checks() {
        let model = menu_model::parse_menu(&json!([
            {"id": "open", "label": "Open"},
            {"type": "separator"},
            {"id": "pin", "label": "Pin", "checked": true}
        ]))
        .expect("valid");
        let value = nodes_json(&model.items);
        assert_eq!(value.len(), 3);
        assert_eq!(value[2]["checked"], json!(true));
    }
}
