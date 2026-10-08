//! Window registry and multi-window RN surfaces (plan §3.3, item 7.4).
//!
//! One [`ViewStore`](crate::store::ViewStore) owns every window: Fabric tags are
//! unique across surfaces of a React instance, so nodes stay in one map and the
//! store routes a batch to the window that shows its surface. This registry owns
//! the *window* lifecycle: it allocates window keys (small integers JS sees) and
//! surface ids, opens GPUI windows bound to a root view, restarts their surfaces
//! on reload and closes them again.
//!
//! The main window is always key `1` and surface `1`; it is adopted by
//! `bootstrap.rs` after it opens, because the bootstrap path also installs the
//! app-surface observers (appearance, navigation, safe area).

use crate::desktop::errors::{DesktopError, DesktopResult};
use crate::desktop::platform_window;
use crate::store::{store_from, StoreGlobal, SurfaceRootView};
use gpui::{
    point, px, size, AnyWindowHandle, App, AppContext, Bounds, Global, Subscription,
    TitlebarOptions, WindowBounds, WindowKind, WindowOptions,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::collections::HashMap;

/// What a window is for. Drives close behavior and which entry points see it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WindowRole {
    /// The launch window (key `1`). Closing it quits unless the app opts out.
    Main,
    /// A window opened through `DesktopWindow.open`.
    Secondary,
    /// A tray popover; kept alive between shows.
    TrayPopover,
}

/// One registered window.
pub struct WindowEntry {
    pub key: u32,
    pub handle: AnyWindowHandle,
    pub surface_id: i32,
    /// `AppRegistry` key of the component this window shows.
    pub component: String,
    /// The user props the surface was started with (without `windowId`).
    pub props: Value,
    pub role: WindowRole,
    /// Whether a JS `closeRequested` listener wants to veto the close.
    pub intercept_close: bool,
    pub title: String,
    /// Bounds/activation observers and the frame hook, kept alive for the
    /// window's lifetime.
    pub subscriptions: Vec<Subscription>,
}

/// The window registry. A GPUI global, mutated only on the main thread.
pub struct DesktopWindows {
    by_key: BTreeMap<u32, WindowEntry>,
    by_surface: HashMap<i32, u32>,
    next_key: u32,
    next_surface: i32,
}

pub struct DesktopWindowsGlobal(pub DesktopWindows);
impl Global for DesktopWindowsGlobal {}

impl DesktopWindows {
    /// `next_surface` starts above the LogBox surface id (2) so a window surface
    /// can never collide with a surface React started itself.
    pub fn new() -> Self {
        Self {
            by_key: BTreeMap::new(),
            by_surface: HashMap::new(),
            next_key: 2,
            next_surface: 3,
        }
    }

    fn alloc_key(&mut self) -> u32 {
        let key = self.next_key;
        self.next_key += 1;
        key
    }

    fn alloc_surface(&mut self) -> i32 {
        let surface = self.next_surface;
        self.next_surface += 1;
        surface
    }

    pub fn get(&self, key: u32) -> Option<&WindowEntry> {
        self.by_key.get(&key)
    }

    pub fn get_mut(&mut self, key: u32) -> Option<&mut WindowEntry> {
        self.by_key.get_mut(&key)
    }

    pub fn entry_for_surface(&self, surface_id: i32) -> Option<&WindowEntry> {
        self.by_surface
            .get(&surface_id)
            .and_then(|key| self.by_key.get(key))
    }

    pub fn keys(&self) -> Vec<u32> {
        self.by_key.keys().copied().collect()
    }

    pub fn len(&self) -> usize {
        self.by_key.len()
    }

    /// Adopt an already-open window (the main window) under `key`.
    pub fn adopt(
        &mut self,
        key: u32,
        handle: AnyWindowHandle,
        surface_id: i32,
        component: String,
        props: Value,
        role: WindowRole,
    ) {
        self.by_key.insert(
            key,
            WindowEntry {
                key,
                handle,
                surface_id,
                component,
                props,
                role,
                intercept_close: false,
                title: String::new(),
                subscriptions: Vec::new(),
            },
        );
        self.by_surface.insert(surface_id, key);
    }

    fn insert(&mut self, entry: WindowEntry) {
        self.by_surface.insert(entry.surface_id, entry.key);
        self.by_key.insert(entry.key, entry);
    }

    fn remove(&mut self, key: u32) -> Option<WindowEntry> {
        let entry = self.by_key.remove(&key)?;
        self.by_surface.remove(&entry.surface_id);
        Some(entry)
    }
}

impl Default for DesktopWindows {
    fn default() -> Self {
        Self::new()
    }
}

/// The main window's key (plan §3.3: "The main window is always `1`").
pub const MAIN_WINDOW_KEY: u32 = 1;

/// Options for [`open_window`], deserialized from the JS `window.open` args.
#[derive(Clone, Debug, Default)]
pub struct OpenWindowOptions {
    pub component: String,
    pub props: Option<Value>,
    pub title: Option<String>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub resizable: bool,
    pub appears_transparent: bool,
    pub traffic_light_position: Option<(f32, f32)>,
    pub role: WindowRoleOverride,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum WindowRoleOverride {
    #[default]
    Secondary,
    TrayPopover,
}

impl OpenWindowOptions {
    fn role(&self) -> WindowRole {
        match self.role {
            WindowRoleOverride::Secondary => WindowRole::Secondary,
            WindowRoleOverride::TrayPopover => WindowRole::TrayPopover,
        }
    }
}

/// Open a window running `component`, start its surface and register it.
pub fn open_window(cx: &mut App, mut options: OpenWindowOptions) -> Result<u32, DesktopError> {
    if options.component.is_empty() {
        return Err(DesktopError::invalid_argument(
            "window.open requires a component name",
        ));
    }
    let store =
        store_from(cx).ok_or_else(|| DesktopError::failed("the view store is not initialized"))?;
    let (host, frame_hook) = {
        let store = store.read(cx);
        (store.host.clone(), store.frame_hook.clone())
    };
    let (key, surface_id) = {
        let windows = &mut cx.global_mut::<DesktopWindowsGlobal>().0;
        (windows.alloc_key(), windows.alloc_surface())
    };

    let width = options.width.unwrap_or(800.0).max(120.0);
    let height = options.height.unwrap_or(600.0).max(120.0);
    let bounds = match (options.x, options.y) {
        (Some(x), Some(y)) => Bounds::new(point(px(x), px(y)), size(px(width), px(height))),
        _ => Bounds::centered(None, size(px(width), px(height)), cx),
    };
    let title = options
        .title
        .clone()
        .unwrap_or_else(|| options.component.clone());
    let window_options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(bounds)),
        titlebar: Some(TitlebarOptions {
            title: Some(title.clone().into()),
            appears_transparent: options.appears_transparent,
            traffic_light_position: options
                .traffic_light_position
                .map(|(x, y)| point(px(x), px(y))),
        }),
        is_resizable: options.resizable,
        window_min_size: Some(size(px(120.0), px(120.0))),
        kind: WindowKind::Normal,
        // A transparent title bar means the app draws and moves the bar itself.
        app_owns_titlebar_drag: options.appears_transparent,
        ..Default::default()
    };

    let store_for_root = store.clone();
    let handle = cx
        .open_window(window_options, move |window, cx| {
            let root = cx.new(|_| SurfaceRootView::new(surface_id));
            let window_handle: AnyWindowHandle = window.window_handle().into();
            store_for_root.update(cx, |store, cx| {
                store.register_root(surface_id, root.clone());
                store.register_window(surface_id, window_handle);
                cx.notify();
            });
            root
        })
        .map_err(|error| DesktopError::failed(format!("could not open the window: {error}")))?;

    // The surface is laid out in the window's content area; `viewport_size` is
    // the same value the bounds observer reports.
    let (w, h, scale) = handle
        .update(cx, |_root, window, _cx| {
            let size = window.viewport_size();
            (
                f32::from(size.width),
                f32::from(size.height),
                window.scale_factor(),
            )
        })
        .unwrap_or((width, height, 2.0));

    let mut props = options.props.clone().unwrap_or_else(|| json!({}));
    if !props.is_object() {
        return Err(DesktopError::invalid_argument(
            "window.open props must be an object",
        ));
    }
    if let Some(object) = props.as_object_mut() {
        object.insert("windowId".to_string(), json!(key));
    }
    host.start_surface_with_props(
        surface_id,
        &options.component,
        &props.to_string(),
        w,
        h,
        scale,
    );

    let subscriptions = handle
        .update(cx, |_root, window, cx| {
            let mut subscriptions = Vec::new();
            frame_hook.arm(window);
            subscriptions.push(install_bounds_observer(window, cx));
            subscriptions.push(install_activation_observer(window, cx, key));
            install_close_hook(window, cx, key);
            subscriptions
        })
        .map_err(|error| {
            DesktopError::failed(format!("could not configure the window: {error}"))
        })?;

    let role = options.role();
    let component = options.component.clone();
    let entry = WindowEntry {
        key,
        handle: handle.into(),
        surface_id,
        component,
        props: options.props.take().unwrap_or_else(|| json!({})),
        role,
        intercept_close: false,
        title,
        subscriptions,
    };
    cx.global_mut::<DesktopWindowsGlobal>().0.insert(entry);
    log::info!(
        "[desktop] opened window {key} (surface {surface_id}, {})",
        options.component
    );
    emit_window_event(cx, "gpuiDesktop:windowOpened", json!({"windowId": key}));
    Ok(key)
}

/// Close a window and stop its surface.
pub fn close_window(cx: &mut App, key: u32, force: bool) -> DesktopResult {
    let entry = {
        let windows = &mut cx.global_mut::<DesktopWindowsGlobal>().0;
        windows.remove(key)
    };
    let Some(entry) = entry else {
        return Err(DesktopError::not_found(format!("window {key} is not open")));
    };
    let _ = force;
    if entry.intercept_close && entry.role != WindowRole::TrayPopover {
        // The caller decided to close; a vetoing listener was already answered.
    }
    let is_main = entry.role == WindowRole::Main;
    let surface_id = entry.surface_id;
    let handle = entry.handle;

    if let Some(store) = store_from(cx) {
        store.update(cx, |store, _cx| {
            store.unregister_window(surface_id);
            store.host.stop_surface(surface_id);
        });
    }
    let _ = handle.update(cx, |_root, window, _cx| window.remove_window());
    log::info!("[desktop] closed window {key} (surface {surface_id})");
    emit_window_event(cx, "gpuiDesktop:windowClosed", json!({"windowId": key}));

    if is_main && quit_on_last_window_closed(cx) {
        cx.quit();
    }
    Ok(json!({"windowId": key}))
}

/// Whether closing the last window should quit the app. The launch config can
/// turn this off for tray apps.
fn quit_on_last_window_closed(cx: &App) -> bool {
    !cx.try_global::<QuitOnLastWindowClosed>()
        .is_some_and(|flag| !flag.0)
}

/// Launch-config flag (`DesktopAppConfig::quit_on_last_window_closed`).
pub struct QuitOnLastWindowClosed(pub bool);
impl Global for QuitOnLastWindowClosed {}

/// `window.close` from JS. A close request from the OS (`closeRequested`) is
/// routed through [`request_close`].
pub fn close(cx: &mut App, key: u32, force: bool) -> DesktopResult {
    close_window(cx, key, force)
}

/// Bring a window to the front.
pub fn focus(cx: &mut App, key: u32) -> DesktopResult {
    let Some(entry) = cx.global::<DesktopWindowsGlobal>().0.get(key) else {
        return Err(DesktopError::not_found(format!("window {key} is not open")));
    };
    let handle = entry.handle;
    handle
        .update(cx, |_root, window, _cx| window.activate_window())
        .map_err(|error| DesktopError::failed(format!("window {key} is gone: {error}")))?;
    Ok(json!({"windowId": key, "focused": true}))
}

/// Run `action` against a window's GPUI `Window`, mapping a stale handle to
/// `not_found` and a platform failure to `unsupported`.
fn with_window(
    cx: &mut App,
    key: u32,
    action: impl FnOnce(&mut gpui::Window) -> Result<(), DesktopError>,
) -> DesktopResult {
    let Some(entry) = cx.global::<DesktopWindowsGlobal>().0.get(key) else {
        return Err(DesktopError::not_found(format!("window {key} is not open")));
    };
    let handle = entry.handle;
    handle
        .update(cx, |_root, window, _cx| action(window))
        .map_err(|error| DesktopError::failed(format!("window {key} is gone: {error}")))??;
    Ok(json!({"windowId": key}))
}

pub fn set_title(cx: &mut App, key: u32, title: String) -> DesktopResult {
    if let Some(entry) = cx.global_mut::<DesktopWindowsGlobal>().0.get_mut(key) {
        entry.title = title.clone();
    }
    with_window(cx, key, move |window| {
        window.set_window_title(&title);
        Ok(())
    })
}

pub fn set_size(cx: &mut App, key: u32, width: f32, height: f32) -> DesktopResult {
    with_window(cx, key, move |window| {
        window.resize(gpui::size(px(width), px(height)));
        Ok(())
    })
}

pub fn set_position(cx: &mut App, key: u32, x: f32, y: f32) -> DesktopResult {
    if !platform_window::supports_position() {
        return Err(DesktopError::unsupported(
            "this session cannot position windows (Wayland has no absolute placement)",
        ));
    }
    with_window(cx, key, move |window| {
        platform_window::set_position(window, x, y).map_err(DesktopError::failed)
    })
}

pub fn set_min_size(cx: &mut App, key: u32, width: f32, height: f32) -> DesktopResult {
    with_window(cx, key, move |window| {
        platform_window::set_min_size(window, width, height).map_err(DesktopError::unsupported)
    })
}

pub fn set_max_size(cx: &mut App, key: u32, width: f32, height: f32) -> DesktopResult {
    with_window(cx, key, move |window| {
        platform_window::set_max_size(window, width, height).map_err(DesktopError::unsupported)
    })
}

pub fn set_resizable(cx: &mut App, key: u32, resizable: bool) -> DesktopResult {
    with_window(cx, key, move |window| {
        platform_window::set_resizable(window, resizable).map_err(DesktopError::unsupported)
    })
}

pub fn set_always_on_top(cx: &mut App, key: u32, on: bool) -> DesktopResult {
    with_window(cx, key, move |window| {
        platform_window::set_always_on_top(window, on).map_err(DesktopError::unsupported)
    })
}

pub fn minimize(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        window.minimize_window();
        Ok(())
    })
}

pub fn maximize(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        if !platform_window::is_maximized(window) {
            window.zoom_window();
        }
        Ok(())
    })
}

pub fn unmaximize(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        if platform_window::is_maximized(window) {
            window.zoom_window();
        }
        Ok(())
    })
}

pub fn toggle_maximize(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        window.zoom_window();
        Ok(())
    })
}

pub fn set_fullscreen(cx: &mut App, key: u32, fullscreen: bool) -> DesktopResult {
    with_window(cx, key, move |window| {
        if window.is_fullscreen() != fullscreen {
            window.toggle_fullscreen();
        }
        Ok(())
    })
}

pub fn show(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        platform_window::show(window).map_err(DesktopError::unsupported)
    })
}

pub fn hide(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        platform_window::hide(window).map_err(DesktopError::unsupported)
    })
}

/// Begin a window move from a drag region's mouse-down.
pub fn start_dragging(cx: &mut App, key: u32) -> DesktopResult {
    with_window(cx, key, |window| {
        window.start_window_move();
        Ok(())
    })
}

/// Emit a `gpuiDesktop:*` device event with a JSON payload.
pub fn emit_window_event(cx: &App, name: &str, payload: Value) {
    let Some(store) = store_from(cx) else {
        return;
    };
    let host = store.read(cx).host.clone();
    host.emit_device_event_json(name, &payload.to_string());
}

/// State of a window, as `DesktopWindow.getState` reports it.
pub fn window_state(cx: &mut App, key: u32) -> DesktopResult {
    let Some(entry) = cx.global::<DesktopWindowsGlobal>().0.get(key) else {
        return Err(DesktopError::not_found(format!("window {key} is not open")));
    };
    let handle = entry.handle;
    handle
        .update(cx, |_root, window, _cx| {
            let bounds = window.bounds();
            json!({
                "windowId": key,
                "bounds": {
                    "x": f32::from(bounds.origin.x),
                    "y": f32::from(bounds.origin.y),
                    "width": f32::from(bounds.size.width),
                    "height": f32::from(bounds.size.height),
                },
                "isMaximized": platform_window::is_maximized(window),
                "isFullscreen": window.is_fullscreen(),
                "isFocused": window.is_window_active(),
                "isMinimized": platform_window::is_minimized(window),
                "scaleFactor": window.scale_factor(),
            })
        })
        .map_err(|error| DesktopError::failed(format!("window {key} is gone: {error}")))
}

/// Every open window, as `DesktopWindow.all` reports it.
pub fn list_windows(cx: &App) -> DesktopResult {
    let windows = &cx.global::<DesktopWindowsGlobal>().0;
    let list: Vec<Value> = windows
        .keys()
        .into_iter()
        .filter_map(|key| {
            let entry = windows.get(key)?;
            Some(json!({
                "windowId": key,
                "component": entry.component,
                "role": match entry.role {
                    WindowRole::Main => "main",
                    WindowRole::Secondary => "secondary",
                    WindowRole::TrayPopover => "trayPopover",
                },
            }))
        })
        .collect();
    Ok(json!({"windows": list}))
}

fn install_bounds_observer(
    window: &mut gpui::Window,
    cx: &mut gpui::Context<SurfaceRootView>,
) -> Subscription {
    let last = std::rc::Rc::new(std::cell::Cell::new(None::<(f32, f32, f32, f32)>));
    cx.observe_window_bounds(window, move |_root, window, cx| {
        let size = window.viewport_size();
        let bounds = window.bounds();
        let (width, height) = (f32::from(size.width), f32::from(size.height));
        let (x, y) = (f32::from(bounds.origin.x), f32::from(bounds.origin.y));
        let scale = window.scale_factor();
        if last.get() == Some((x, y, width, height)) {
            return;
        }
        last.set(Some((x, y, width, height)));
        let handle: AnyWindowHandle = window.window_handle().into();
        let Some(store) = cx.try_global::<StoreGlobal>() else {
            return;
        };
        let store = store.0.clone();
        store.update(cx, |store, _cx| {
            store.resize_window(handle, width, height, scale)
        });
        let frame_hook = store.read(cx).frame_hook.clone();
        frame_hook.arm(window);
        // One event per bounds change; GPUI delivers one observer call per
        // platform resize/move, which is already coalesced to a frame.
        if let Some(key) = window_key_for_handle(cx, handle) {
            let host = store.read(cx).host.clone();
            host.emit_device_event_json(
                "gpuiDesktop:windowResize",
                &json!({"windowId": key, "width": width, "height": height}).to_string(),
            );
            host.emit_device_event_json(
                "gpuiDesktop:windowMove",
                &json!({"windowId": key, "x": x, "y": y}).to_string(),
            );
        }
    })
}

/// The registry key of the window with this handle.
fn window_key_for_handle(cx: &gpui::App, handle: AnyWindowHandle) -> Option<u32> {
    let windows = cx.try_global::<DesktopWindowsGlobal>()?;
    windows
        .0
        .keys()
        .into_iter()
        .find(|key| windows.0.get(*key).map(|entry| entry.handle) == Some(handle))
}

fn install_activation_observer(
    window: &mut gpui::Window,
    cx: &mut gpui::Context<SurfaceRootView>,
    key: u32,
) -> Subscription {
    let mut last = window.is_window_active();
    cx.observe_window_activation(window, move |_root, window, cx| {
        let active = window.is_window_active();
        if active == last {
            return;
        }
        last = active;
        let Some(store) = cx.try_global::<StoreGlobal>() else {
            return;
        };
        let host = store.0.read(cx).host.clone();
        let name = if active {
            "gpuiDesktop:windowFocus"
        } else {
            "gpuiDesktop:windowBlur"
        };
        host.emit_device_event_json(name, &json!({"windowId": key}).to_string());
    })
}

fn install_close_hook(
    window: &mut gpui::Window,
    cx: &mut gpui::Context<SurfaceRootView>,
    key: u32,
) {
    let last_request: std::rc::Rc<std::cell::Cell<Option<std::time::Instant>>> =
        std::rc::Rc::new(std::cell::Cell::new(None));
    window.on_window_should_close(cx, move |window, cx| {
        let intercept = cx
            .try_global::<DesktopWindowsGlobal>()
            .and_then(|windows| windows.0.get(key).map(|entry| entry.intercept_close))
            .unwrap_or(false);
        if !intercept {
            return true;
        }
        // A second close request within three seconds closes the window even if
        // JS never answered, so a hung or mid-reload app can always be quit.
        let now = std::time::Instant::now();
        if last_request.get().is_some_and(|previous| {
            now.duration_since(previous) < std::time::Duration::from_secs(3)
        }) {
            log::warn!("[desktop] window {key} close was not answered by JS; closing");
            return true;
        }
        last_request.set(Some(now));
        emit_close_requested(cx, window, key);
        false
    });
}

fn emit_close_requested(cx: &mut App, window: &mut gpui::Window, key: u32) {
    let Some(store) = cx.try_global::<StoreGlobal>() else {
        return;
    };
    let host = store.0.read(cx).host.clone();
    host.emit_device_event_json(
        "gpuiDesktop:closeRequested",
        &json!({"windowId": key}).to_string(),
    );
    store.0.read(cx).frame_hook.arm(window);
}

/// The JS-visible window id for a surface (used by `DesktopWindow.current`).
pub fn window_id_for_surface(cx: &App, surface_id: i32) -> Option<u32> {
    cx.try_global::<DesktopWindowsGlobal>().and_then(|windows| {
        windows
            .0
            .entry_for_surface(surface_id)
            .map(|entry| entry.key)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_and_surfaces_are_allocated_without_collisions() {
        let mut windows = DesktopWindows::new();
        assert_eq!(windows.alloc_key(), 2);
        assert_eq!(windows.alloc_key(), 3);
        // LogBox is surface 2; a window surface must never reuse it.
        assert_eq!(windows.alloc_surface(), 3);
        assert_eq!(windows.alloc_surface(), 4);
    }

    #[test]
    fn entries_are_indexed_by_key_and_surface() {
        let mut windows = DesktopWindows::new();
        windows.adopt(
            MAIN_WINDOW_KEY,
            gpui::AnyWindowHandle::from(gpui::WindowId::from(1usize)),
            1,
            "App".to_string(),
            json!({}),
            WindowRole::Main,
        );
        assert_eq!(windows.len(), 1);
        assert_eq!(windows.entry_for_surface(1).map(|e| e.key), Some(1));
        assert!(windows.get(1).is_some());
        assert!(windows.get(2).is_none());
    }
}
