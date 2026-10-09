//! Dev Menu (plan item 7.5, §10).
//!
//! Cmd/Ctrl+D (and the Help menu's dev group) opens a native popup through the
//! 7.2 context-menu presenter, with:
//!
//! * Reload
//! * Open DevTools (React Native DevTools over the Metro inspector proxy)
//! * Toggle Element Inspector
//! * Toggle Perf Monitor
//! * Fast Refresh on/off
//!
//! Dev builds only: [`install`] is a no-op unless `enabled`, which the launch
//! config sets from `debug_assertions` or an explicit override.

use crate::desktop::menu_model::{MenuItemDef, MenuModel, MenuNode};
use crate::desktop::perf_monitor;
use crate::desktop::windows::{DesktopWindowsGlobal, MAIN_WINDOW_KEY};
use crate::store::store_from;
use gpui::{App, Global};
use serde_json::{json, Value};
use std::cell::RefCell;

pub const RELOAD: &str = "dev:reload";
pub const OPEN_DEVTOOLS: &str = "dev:openDevTools";
pub const ELEMENT_INSPECTOR: &str = "dev:elementInspector";
pub const PERF_MONITOR: &str = "dev:perfMonitor";
pub const FAST_REFRESH: &str = "dev:fastRefresh";
/// The accelerator the Dev Menu opens with.
pub const ACCELERATOR: &str = "secondary-d";
/// The action id bound to [`ACCELERATOR`].
pub const ACCELERATOR_ID: &str = "dev:menu";

#[derive(Default)]
pub struct DevSettings {
    pub installed: bool,
    pub hot_loading: bool,
    pub profiling: bool,
    pub inspector: bool,
}

pub struct DevSettingsGlobal(pub RefCell<DevSettings>);
impl Global for DevSettingsGlobal {}

pub fn is_installed(cx: &App) -> bool {
    cx.try_global::<DevSettingsGlobal>()
        .is_some_and(|state| state.0.borrow().installed)
}

/// Install the Dev Menu handlers. Called once at startup; `enabled` is false in
/// a release build unless the app asks for it.
pub fn install(cx: &mut App, enabled: bool) {
    cx.set_global(DevSettingsGlobal(RefCell::new(DevSettings {
        installed: enabled,
        hot_loading: true,
        ..Default::default()
    })));
}

/// The dev menu's items, reflecting the current toggles.
pub fn menu_model(cx: &App) -> MenuModel {
    let (hot_loading, inspector) = cx
        .try_global::<DevSettingsGlobal>()
        .map(|state| {
            let state = state.0.borrow();
            (state.hot_loading, state.inspector)
        })
        .unwrap_or((false, false));
    let profiling = perf_monitor::is_enabled(cx);
    let item = |id: &str, label: &str, checked: bool| {
        MenuNode::Item(MenuItemDef {
            id: id.to_string(),
            label: label.to_string(),
            accelerator: None,
            enabled: true,
            checked,
            role: None,
        })
    };
    MenuModel {
        items: vec![
            item(RELOAD, "Reload", false),
            item(OPEN_DEVTOOLS, "Open DevTools", false),
            MenuNode::Separator,
            item(ELEMENT_INSPECTOR, "Toggle Element Inspector", inspector),
            item(PERF_MONITOR, "Toggle Perf Monitor", profiling),
            item(FAST_REFRESH, "Fast Refresh", hot_loading),
        ],
    }
}

/// Show the Dev Menu as a modal panel.
///
/// React Native's dev menu is a modal, not a popup menu, so this opens a
/// `WindowKind::Dialog` — a sheet on macOS, a modal dialog on Windows — sized
/// like RN's and rendered by GPUI. The panel runs its items through the same
/// dispatch as the menu items (`perform`).
pub fn show(cx: &mut App) {
    if !is_installed(cx) {
        log::warn!("[desktop][devmenu] the Dev Menu is not enabled in this build");
        return;
    }
    // The panel may have been closed since it was recorded (its own Close row,
    // the sheet's close button, or Cmd+W), so liveness is asked of the window
    // rather than remembered: a stale flag here is what made Cmd+D work only
    // once per launch.
    if let Some(handle) = open_panel(cx) {
        // Already open: bring it forward instead of stacking a second sheet.
        let _ = handle.update(cx, |_root: gpui::AnyView, window, _cx| {
            window.activate_window();
        });
        return;
    }
    // A plain dialog window, not a sheet: `WindowKind::Dialog` is an
    // `NSPanel` attached as a sheet on macOS, which is not what a dev menu
    // should look like. This is centred over the app window instead.
    let size = gpui::size(gpui::px(380.0), gpui::px(460.0));
    let bounds = main_window(cx)
        .and_then(|handle| {
            handle
                .update(cx, |_root: gpui::AnyView, window, _cx| window.bounds())
                .ok()
        })
        .map(|parent| {
            gpui::Bounds::new(
                gpui::point(
                    parent.origin.x + (parent.size.width - size.width) / 2.0,
                    parent.origin.y + (parent.size.height - size.height) / 2.0,
                ),
                size,
            )
        })
        .unwrap_or_else(|| gpui::Bounds::centered(None, size, cx));
    let options = gpui::WindowOptions {
        window_bounds: Some(gpui::WindowBounds::Windowed(bounds)),
        kind: gpui::WindowKind::Normal,
        is_resizable: false,
        window_min_size: Some(size),
        titlebar: Some(gpui::TitlebarOptions {
            title: Some("Dev Menu".into()),
            appears_transparent: false,
            traffic_light_position: None,
        }),
        ..Default::default()
    };
    match cx.open_window(options, |_window, cx| {
        gpui::AppContext::new(cx, |_cx| DevMenuPanel::new())
    }) {
        Ok(handle) => {
            let handle: gpui::AnyWindowHandle = handle.into();
            cx.set_global(DevMenuPanelGlobal(RefCell::new(Some(handle))));
            // Windows animate in on some platforms; the dev menu should just
            // appear.
            let _ = handle.update(cx, |_root: gpui::AnyView, window, _cx| {
                crate::desktop::platform_window::disable_window_animation(window);
            });
            log::info!("[desktop][devmenu] opened the panel");
        }
        Err(error) => log::error!("[desktop][devmenu] could not open the panel: {error}"),
    }
}

/// Close the panel if it is open (its Close row, the window's own close button,
/// or a caller that wants it gone).
pub fn hide(cx: &mut App) {
    let Some(handle) = open_panel(cx) else {
        forget_panel(cx);
        return;
    };
    forget_panel(cx);
    let _ = handle.update(cx, |_root: gpui::AnyView, window, _cx| {
        window.remove_window()
    });
}

/// The open Dev Menu panel, if any.
pub struct DevMenuPanelGlobal(pub RefCell<Option<gpui::AnyWindowHandle>>);
impl Global for DevMenuPanelGlobal {}

/// The panel's window, if it is still on screen.
fn open_panel(cx: &mut App) -> Option<gpui::AnyWindowHandle> {
    let handle = cx
        .try_global::<DevMenuPanelGlobal>()
        .and_then(|panel| *panel.0.borrow())?;
    handle
        .update(cx, |_root: gpui::AnyView, _window, _cx| ())
        .ok()?;
    Some(handle)
}

/// Forget the panel. Called when it closes, from every path that can close it.
fn forget_panel(cx: &mut App) {
    if let Some(panel) = cx.try_global::<DevMenuPanelGlobal>() {
        panel.0.borrow_mut().take();
    }
}

/// The modal's contents: one row per item, with the toggles checked.
pub struct DevMenuPanel;

impl DevMenuPanel {
    pub fn new() -> Self {
        Self
    }
}

impl gpui::Render for DevMenuPanel {
    fn render(
        &mut self,
        window: &mut gpui::Window,
        cx: &mut gpui::Context<Self>,
    ) -> impl gpui::IntoElement {
        use gpui::{InteractiveElement, IntoElement, ParentElement, Styled};

        // Escape, Cmd+W and the sheet's own close button all land here, so the
        // recorded handle is dropped wherever the panel goes away.
        window.on_window_should_close(cx, |_window, cx| {
            forget_panel(cx);
            true
        });

        let rows = menu_model(cx);
        let mut elements: Vec<gpui::AnyElement> = Vec::new();
        for node in rows.items {
            match node {
                MenuNode::Separator => {
                    elements.push(
                        gpui::div()
                            .h(gpui::px(1.0))
                            .my_1()
                            .bg(gpui::rgba(0x00000022))
                            .into_any_element() as gpui::AnyElement,
                    );
                }
                MenuNode::Item(item) => {
                    let id = item.id.clone();
                    elements.push(
                        gpui::div()
                            .id(gpui::SharedString::from(format!("dev-menu-{}", item.id)))
                            .flex()
                            .flex_row()
                            .items_center()
                            .justify_between()
                            .px_3()
                            .py_2()
                            .rounded(gpui::px(3.0))
                            .text_size(gpui::px(14.0))
                            .cursor_pointer()
                            .hover(|style| style.bg(gpui::rgba(0x00000011)))
                            .child(item.label.clone())
                            .child(if item.checked { "✓" } else { "" })
                            .on_mouse_down(
                                gpui::MouseButton::Left,
                                cx.listener(move |_this, _event, window, cx| {
                                    if let Some(handler) =
                                        rn_gpui_sys::DEV_MENU_PERFORM_HANDLER.get()
                                    {
                                        handler(id.clone());
                                    }
                                    forget_panel(cx);
                                    window.remove_window();
                                }),
                            )
                            .into_any_element(),
                    );
                }
                MenuNode::Submenu(_) | MenuNode::StandardMenu(_) => {}
            }
        }

        gpui::div()
            .id(gpui::SharedString::from("dev-menu-panel"))
            .size_full()
            .flex()
            .flex_col()
            .gap_1()
            .p_3()
            .bg(gpui::rgb(0xf4f5f7))
            .text_color(gpui::rgb(0x18212f))
            .child(
                gpui::div()
                    .px_3()
                    .py_2()
                    .text_size(gpui::px(18.0))
                    .child("Dev Menu"),
            )
            .children(elements)
            .child(
                gpui::div()
                    .id(gpui::SharedString::from("dev-menu-close"))
                    .mt_2()
                    .px_3()
                    .py_2()
                    .rounded(gpui::px(3.0))
                    .text_size(gpui::px(14.0))
                    .text_color(gpui::rgba(0x00000099))
                    .cursor_pointer()
                    .hover(|style| style.bg(gpui::rgba(0x00000011)))
                    .child("Close")
                    .on_mouse_down(
                        gpui::MouseButton::Left,
                        cx.listener(|_this, _event, window, cx| {
                            forget_panel(cx);
                            window.remove_window();
                        }),
                    ),
            )
    }
}

/// Run one dev menu item. `DevMenu` / `DevSettings` also route here by name.
pub fn perform(cx: &mut App, id: &str) {
    match id {
        RELOAD => {
            if let Some(store) = store_from(cx) {
                store.read(cx).host.request_reload();
            }
        }
        OPEN_DEVTOOLS => {
            if let Some(store) = store_from(cx) {
                store.read(cx).host.open_debugger();
            }
            emit(cx, "gpuiDesktop:devToolsRequested", json!({}));
        }
        ELEMENT_INSPECTOR => {
            let enabled = toggle(cx, "inspector");
            emit(
                cx,
                "gpuiDesktop:elementInspector",
                json!({"enabled": enabled}),
            );
        }
        PERF_MONITOR => {
            let enabled = !perf_monitor::is_enabled(cx);
            perf_monitor::set_enabled(cx, enabled);
        }
        FAST_REFRESH => {
            let enabled = toggle(cx, "hotLoading");
            emit(cx, "gpuiDesktop:fastRefresh", json!({"enabled": enabled}));
        }
        _ => {}
    }
}

/// `DevMenu` / `DevSettings` toggles, by name.
pub fn apply_setting(cx: &mut App, name: &str, enabled: bool) {
    match name {
        "profiling" => {
            perf_monitor::set_enabled(cx, enabled);
        }
        "hotLoading" => {
            if let Some(state) = cx.try_global::<DevSettingsGlobal>() {
                state.0.borrow_mut().hot_loading = enabled;
            }
            emit(cx, "gpuiDesktop:fastRefresh", json!({"enabled": enabled}));
        }
        // `DevSettings.toggleElementInspector` has no value to pass.
        "inspectorToggle" => {
            let enabled = toggle(cx, "inspector");
            emit(
                cx,
                "gpuiDesktop:elementInspector",
                json!({"enabled": enabled}),
            );
        }
        "inspector" => {
            if let Some(state) = cx.try_global::<DevSettingsGlobal>() {
                state.0.borrow_mut().inspector = enabled;
            }
            emit(
                cx,
                "gpuiDesktop:elementInspector",
                json!({"enabled": enabled}),
            );
        }
        _ => {}
    }
}

fn toggle(cx: &App, which: &str) -> bool {
    let Some(state) = cx.try_global::<DevSettingsGlobal>() else {
        return false;
    };
    let mut state = state.0.borrow_mut();
    let value = match which {
        "inspector" => &mut state.inspector,
        "hotLoading" => &mut state.hot_loading,
        "profiling" => &mut state.profiling,
        _ => return false,
    };
    *value = !*value;
    *value
}

fn emit(cx: &App, name: &str, payload: Value) {
    let Some(store) = store_from(cx) else {
        return;
    };
    store
        .read(cx)
        .host
        .emit_device_event_json(name, &payload.to_string());
}

/// The main window, for presenters that need one. Only the Windows menu-bar
/// path needs it today, so it is allowed to be unused elsewhere.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn main_window(cx: &App) -> Option<gpui::AnyWindowHandle> {
    cx.try_global::<DesktopWindowsGlobal>()
        .and_then(|windows| windows.0.get(MAIN_WINDOW_KEY).map(|entry| entry.handle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accelerator_is_command_or_control_d() {
        assert_eq!(ACCELERATOR, "secondary-d");
        assert_eq!(ACCELERATOR_ID, "dev:menu");
    }

    #[test]
    fn dev_item_ids_are_unique() {
        let ids = [
            RELOAD,
            OPEN_DEVTOOLS,
            ELEMENT_INSPECTOR,
            PERF_MONITOR,
            FAST_REFRESH,
        ];
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
    }
}
