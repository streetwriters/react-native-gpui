//! Menu-bar (tray) apps (plan item 7.3, §7).
//!
//! A `NSStatusItem` (macOS), a notification-area icon (Windows) or an
//! AppIndicator/StatusNotifierItem (Linux) through `tray-icon`. Clicking it
//! shows a GPUI popup window running its own React Native surface, and
//! optionally a native menu.
//!
//! Platform caveats, per the plan:
//!
//! * Windows has no anchored popover: the window is placed at the click point
//!   rather than under the icon.
//! * Linux AppIndicator only supports menus on GNOME, not click-to-popover, so
//!   the menu is the only reliable interaction there.
//!
//! The icon is created on the main thread once the app is running, and its
//! events arrive on the platform's event thread, so they are forwarded to the
//! GPUI main thread through the same queue as every other desktop call.

use crate::desktop::errors::{DesktopError, DesktopResult};
use crate::desktop::menu_model::{self, MenuModel};
use crate::desktop::windows::{self, OpenWindowOptions, WindowRoleOverride};
use gpui::{App, Global};
use serde_json::{json, Value};
use std::cell::RefCell;

/// A tray icon's configuration (plan §7.3).
#[derive(Clone)]
pub struct TrayConfig {
    /// Stable id, so an app can run more than one icon later.
    pub id: String,
    pub tooltip: Option<String>,
    /// macOS-only text label; other platforms ignore it.
    pub title: Option<String>,
    /// RGBA pixels for the icon. `None` uses a built-in template glyph.
    pub icon: Option<(Vec<u8>, u32, u32)>,
    /// Whether the icon is a template image (macOS recolors it for the bar).
    pub icon_is_template: bool,
    /// The RN component the popover surface runs.
    pub component: Option<String>,
    pub width: f32,
    pub height: f32,
    /// A menu to show instead of (or as well as) the popover.
    pub menu: Option<MenuModel>,
    /// Whether a left click opens the menu rather than the popover.
    pub menu_on_left_click: bool,
    /// Keep the app alive when its last window closes.
    pub quit_on_last_window_closed: bool,
    /// Run with no Dock icon and no menu-bar ownership
    /// (`NSApplicationActivationPolicyAccessory` on macOS).
    pub accessory: bool,
}

impl Default for TrayConfig {
    fn default() -> Self {
        Self {
            id: "tray".to_string(),
            tooltip: None,
            title: None,
            icon: None,
            icon_is_template: true,
            component: None,
            width: 320.0,
            height: 420.0,
            menu: None,
            menu_on_left_click: false,
            quit_on_last_window_closed: false,
            accessory: true,
        }
    }
}

impl TrayConfig {
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = id.into();
        self
    }

    pub fn tooltip(mut self, tooltip: impl Into<String>) -> Self {
        self.tooltip = Some(tooltip.into());
        self
    }

    /// Run `component` in the popover window.
    pub fn component(mut self, component: impl Into<String>) -> Self {
        self.component = Some(component.into());
        self
    }

    pub fn size(mut self, width: f32, height: f32) -> Self {
        self.width = width.max(120.0);
        self.height = height.max(120.0);
        self
    }

    pub fn icon_rgba(mut self, rgba: Vec<u8>, width: u32, height: u32) -> Self {
        self.icon = Some((rgba, width, height));
        self
    }

    pub fn menu(mut self, menu: MenuModel) -> Self {
        self.menu = Some(menu);
        self
    }

    /// Whether the app runs as an accessory (no Dock icon). Default true.
    pub fn accessory(mut self, accessory: bool) -> Self {
        self.accessory = accessory;
        self
    }
}

pub struct TrayState {
    icon: Option<tray_icon::TrayIcon>,
    config: TrayConfig,
    /// The popover window's key, while it is open.
    pub popover: Option<u32>,
    visible: bool,
    clicks: u32,
}

pub struct TrayGlobal(pub RefCell<TrayState>);
impl Global for TrayGlobal {}

pub fn is_installed(cx: &App) -> bool {
    cx.try_global::<TrayGlobal>().is_some()
}

/// Create the tray icon. Called once, after the app has started, because
/// `NSStatusItem` needs a running `NSApplication`.
pub fn install(cx: &mut App, config: TrayConfig) -> DesktopResult {
    if is_installed(cx) {
        return Err(DesktopError::failed("a tray icon is already installed"));
    }
    cx.set_global(TrayGlobal(RefCell::new(TrayState {
        icon: None,
        config: config.clone(),
        popover: None,
        visible: true,
        clicks: 0,
    })));
    if !config.quit_on_last_window_closed {
        // A tray-only app must survive its last window closing.
        cx.set_global(crate::desktop::windows::QuitOnLastWindowClosed(false));
    }
    match build_icon(&config) {
        Ok(icon) => {
            cx.global_mut::<TrayGlobal>().0.borrow_mut().icon = Some(icon);
            log::info!("[desktop][tray] installed `{}`", config.id);
            Ok(json!({"id": config.id}))
        }
        Err(error) => {
            log::error!("[desktop][tray] could not create the icon: {error}");
            Err(DesktopError::failed(format!(
                "could not create the tray icon: {error}"
            )))
        }
    }
}

/// Remove the tray icon and close its popover.
pub fn destroy(cx: &mut App) -> DesktopResult {
    let (config, popover) = {
        let Some(tray) = cx.try_global::<TrayGlobal>() else {
            return Err(DesktopError::not_found("no tray icon is installed"));
        };
        let mut tray = tray.0.borrow_mut();
        let popover = tray.popover.take();
        tray.icon = None;
        tray.visible = false;
        (tray.config.id.clone(), popover)
    };
    if let Some(key) = popover {
        let _ = windows::close_window(cx, key, true);
    }
    cx.remove_global::<TrayGlobal>();
    Ok(json!({"id": config, "destroyed": true}))
}

/// A tray click, forwarded from the platform's event thread.
pub fn handle_click(cx: &mut App, rect: TrayRect, button: TrayButton) {
    let (config, menu) = {
        let Some(tray) = cx.try_global::<TrayGlobal>() else {
            return;
        };
        let mut tray = tray.0.borrow_mut();
        tray.clicks += 1;
        (tray.config.clone(), tray.config.menu.clone())
    };
    if wants_menu(menu.is_some(), config.menu_on_left_click, button) {
        if let Some(menu) = menu {
            show_menu(cx, menu, rect);
        }
        return;
    }
    if config.component.is_some() {
        toggle_popover(cx, rect);
        return;
    }
    // No component and no menu: a click with nothing to show is a no-op.
    log::debug!("[desktop][tray] click with no popover component and no menu");
}

/// Show the popover, or hide it when it is already open.
pub fn toggle_popover(cx: &mut App, rect: TrayRect) {
    let open = cx
        .try_global::<TrayGlobal>()
        .and_then(|tray| tray.0.borrow().popover);
    if let Some(key) = open {
        hide_popover(cx);
        let _ = key;
        return;
    }
    show_popover(cx, rect);
}

pub fn show_popover(cx: &mut App, rect: TrayRect) {
    let config = match cx.try_global::<TrayGlobal>() {
        Some(tray) => tray.0.borrow().config.clone(),
        None => return,
    };
    let Some(component) = config.component.clone() else {
        return;
    };
    // Below the icon, horizontally centred on it, clamped to the screen by the
    // platform when the window is created.
    let x = rect.x + rect.width / 2.0 - config.width / 2.0;
    let y = rect.y + rect.height;
    let options = OpenWindowOptions {
        component,
        props: None,
        title: Some(config.tooltip.clone().unwrap_or_else(|| config.id.clone())),
        width: Some(config.width),
        height: Some(config.height),
        x: Some(x),
        y: Some(y),
        resizable: false,
        appears_transparent: false,
        traffic_light_position: None,
        role: WindowRoleOverride::TrayPopover,
        popup: true,
    };
    match windows::open_window(cx, options) {
        Ok(key) => {
            cx.global_mut::<TrayGlobal>().0.borrow_mut().popover = Some(key);
            // A menu-bar popover goes away when it stops being the active
            // window, the way a native popover does; `install_activation_observer`
            // in `windows.rs` does that for the `TrayPopover` role.
            let _ = windows::focus(cx, key);
        }
        Err(error) => log::error!("[desktop][tray] could not open the popover: {error}"),
    }
}

pub fn hide_popover(cx: &mut App) {
    let open = cx
        .try_global::<TrayGlobal>()
        .and_then(|tray| tray.0.borrow_mut().popover.take());
    if let Some(key) = open {
        let _ = windows::hide(cx, key);
    }
}

/// Show `menu` as a native popup next to the icon.
pub fn show_menu(cx: &mut App, menu: MenuModel, rect: TrayRect) {
    let request = crate::desktop::context_menu::ContextMenuRequest {
        window: match crate::desktop::context_menu::target_window(cx) {
            Ok((window, _)) => window,
            Err(error) => {
                log::warn!("[desktop][tray] {error}");
                return;
            }
        },
        x: rect.x,
        y: rect.y + rect.height,
        model: menu,
        native_view: crate::desktop::context_menu::target_window(cx)
            .map(|(_, view)| view)
            .unwrap_or(0),
    };
    let responder = crate::desktop::context_menu::Responder::callback(Box::new(|selection| {
        if let Some(id) = selection {
            if let Some(handler) = rn_gpui_sys::TRAY_MENU_PERFORM_HANDLER.get() {
                handler(id);
            }
        }
    }));
    let presenter = cx
        .global::<crate::desktop::context_menu::ContextMenuPresenterGlobal>()
        .0
        .clone();
    presenter.show(cx, request, responder);
}

/// `Tray.setTooltip` / `Tray.setIcon` / `Tray.setVisible`.
pub fn apply(cx: &mut App, method: &str, args_json: &str) -> DesktopResult {
    let args: Value = serde_json::from_str(args_json).unwrap_or(Value::Null);
    let Some(tray) = cx.try_global::<TrayGlobal>() else {
        return Err(DesktopError::not_found("no tray icon is installed"));
    };
    match method {
        "setTooltip" => {
            let tooltip = args.get("tooltip").and_then(Value::as_str);
            let icon = tray.0.borrow().icon.clone();
            if let Some(icon) = icon {
                let _ = icon.set_tooltip(tooltip);
            }
            tray.0.borrow_mut().config.tooltip = tooltip.map(str::to_string);
            Ok(json!({"tooltip": tooltip}))
        }
        "setVisible" => {
            let visible = args
                .get("visible")
                .and_then(Value::as_bool)
                .ok_or_else(|| DesktopError::invalid_argument("a boolean `visible` is required"))?;
            let icon = tray.0.borrow().icon.clone();
            if let Some(icon) = icon {
                let _ = icon.set_visible(visible);
            }
            tray.0.borrow_mut().visible = visible;
            Ok(json!({"visible": visible}))
        }
        "setIcon" => {
            let path = args
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| DesktopError::invalid_argument("Tray.setIcon requires a path"))?;
            let icon = load_icon(path)?;
            let handle = tray.0.borrow().icon.clone();
            if let Some(handle) = handle {
                handle
                    .set_icon(Some(icon))
                    .map_err(|error| DesktopError::failed(format!("{error}")))?;
            }
            Ok(json!({"path": path}))
        }
        "setMenu" => {
            let menu = match args.get("items") {
                Some(items) => Some(menu_model::parse_menu(items)?),
                None => None,
            };
            tray.0.borrow_mut().config.menu = menu;
            Ok(json!({"items": args.get("items").map(|v| v.as_array().map(Vec::len)).flatten()}))
        }
        _ => Err(DesktopError::unsupported(format!("tray.{method}"))),
    }
}

/// `Tray.getState`, also used by the test driver.
pub fn state(cx: &App) -> Value {
    let Some(tray) = cx.try_global::<TrayGlobal>() else {
        return json!({"installed": false});
    };
    let tray = tray.0.borrow();
    json!({
        "installed": true,
        "id": tray.config.id,
        "tooltip": tray.config.tooltip,
        "visible": tray.visible,
        "component": tray.config.component,
        "popover": tray.popover,
        "clicks": tray.clicks,
        "hasMenu": tray.config.menu.is_some(),
        "menuItems": tray
            .config
            .menu
            .as_ref()
            .map(|menu| crate::desktop::context_menu::nodes_json(&menu.items))
            .unwrap_or_default(),
    })
}

/// A tray click's rectangle, in GPUI points.
#[derive(Clone, Copy, Debug, Default)]
pub struct TrayRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayButton {
    Left,
    Right,
    Middle,
}

fn build_icon(config: &TrayConfig) -> Result<tray_icon::TrayIcon, String> {
    use tray_icon::{TrayIconBuilder, TrayIconEvent};

    let icon = match &config.icon {
        Some((rgba, width, height)) => tray_icon::Icon::from_rgba(rgba.clone(), *width, *height)
            .map_err(|error| error.to_string())?,
        None => default_icon()?,
    };
    let mut builder = TrayIconBuilder::new()
        .with_id(config.id.clone())
        .with_icon_templated(icon)
        // The click is handled here rather than by the menu, so a left click
        // can open the popover.
        .with_menu_on_left_click(false);
    if let Some(tooltip) = &config.tooltip {
        builder = builder.with_tooltip(tooltip.clone());
    }
    if let Some(title) = &config.title {
        builder = builder.with_title(title.clone());
    }
    let tray = builder.build().map_err(|error| error.to_string())?;

    // The handler runs on the platform's event thread; the click is forwarded
    // to the GPUI main thread through the shared queue.
    TrayIconEvent::set_event_handler(Some(move |event| {
        let (rect, button) = match event {
            TrayIconEvent::Click { rect, button, .. } => (rect, button),
            _ => return,
        };
        let button = match button {
            tray_icon::MouseButton::Left => TrayButton::Left,
            tray_icon::MouseButton::Right => TrayButton::Right,
            tray_icon::MouseButton::Middle => TrayButton::Middle,
        };
        let rect = TrayRect {
            x: rect.position.x as f32,
            y: rect.position.y as f32,
            width: rect.size.width as f32,
            height: rect.size.height as f32,
        };
        if let Some(handler) = rn_gpui_sys::TRAY_CLICK_HANDLER.get() {
            handler(rect.x, rect.y, rect.width, rect.height, button as u8);
        }
    }));
    Ok(tray)
}

/// A menu-bar-shaped template glyph, so the tester does not need an asset.
fn default_icon() -> Result<tray_icon::Icon, String> {
    const SIZE: u32 = 22;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let outer = x >= 3 && x < SIZE - 3 && y >= 4 && y < SIZE - 4;
            let inner = x >= 6 && x < SIZE - 6 && y >= 7 && y < SIZE - 7;
            if outer && !inner {
                let index = ((y * SIZE + x) * 4) as usize;
                rgba[index] = 0;
                rgba[index + 1] = 0;
                rgba[index + 2] = 0;
                rgba[index + 3] = 255;
            }
        }
    }
    tray_icon::Icon::from_rgba(rgba, SIZE, SIZE).map_err(|error| error.to_string())
}

/// Load a PNG from disk and hand it to `tray-icon` as RGBA.
fn load_icon(path: &str) -> Result<tray_icon::Icon, DesktopError> {
    let image = image::open(path)
        .map_err(|error| DesktopError::invalid_argument(format!("could not read {path}: {error}")))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    tray_icon::Icon::from_rgba(image.into_raw(), width, height)
        .map_err(|error| DesktopError::failed(format!("{error}")))
}

/// Whether a click opens the menu rather than the popover: a menu has to exist,
/// and it opens on a right click unless the app asked for left clicks too.
fn wants_menu(has_menu: bool, menu_on_left_click: bool, button: TrayButton) -> bool {
    has_menu && (button == TrayButton::Right || menu_on_left_click)
}

/// A tray menu item was chosen: report it to JS.
pub fn emit_menu_press(cx: &App, id: &str) {
    let Some(store) = crate::store::store_from(cx) else {
        return;
    };
    store
        .read(cx)
        .host
        .emit_device_event_json("gpuiDesktop:trayMenuPress", &json!({"id": id}).to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_icon_is_a_valid_template() {
        let icon = default_icon().expect("the built-in glyph is valid");
        let _ = icon;
    }

    #[test]
    fn a_tray_config_defaults_to_a_popover_with_no_menu() {
        let config = TrayConfig::default();
        assert!(config.component.is_none());
        assert!(config.menu.is_none());
        assert!(!config.quit_on_last_window_closed);
        assert_eq!(config.id, "tray");
    }

    #[test]
    fn a_right_click_opens_the_menu_only_when_one_exists() {
        assert!(wants_menu(true, false, TrayButton::Right));
        assert!(!wants_menu(false, false, TrayButton::Right));
        assert!(!wants_menu(true, false, TrayButton::Left));
        assert!(!wants_menu(true, false, TrayButton::Middle));
    }

    #[test]
    fn menu_on_left_click_moves_the_menu_to_the_primary_button() {
        assert!(wants_menu(true, true, TrayButton::Left));
        assert!(wants_menu(true, true, TrayButton::Right));
        assert!(!wants_menu(false, true, TrayButton::Left));
    }

    #[test]
    fn the_builder_sizes_are_clamped() {
        let config = TrayConfig::default().size(10.0, 10.0);
        assert_eq!(config.width, 120.0);
        assert_eq!(config.height, 120.0);
    }
}
