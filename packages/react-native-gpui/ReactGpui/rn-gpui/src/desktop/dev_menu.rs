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

use crate::desktop::context_menu::{self, ContextMenuRequest, Responder};
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

/// Show the Dev Menu.
pub fn show(cx: &mut App) {
    if !is_installed(cx) {
        log::warn!("[desktop][devmenu] the Dev Menu is not enabled in this build");
        return;
    }
    let model = menu_model(cx);
    let (window, native_view) = match context_menu::target_window(cx) {
        Ok(target) => target,
        Err(error) => {
            log::warn!("[desktop][devmenu] {error}");
            return;
        }
    };
    let request = ContextMenuRequest {
        window,
        x: 0.0,
        y: 0.0,
        model,
        native_view,
    };
    // The dev menu has no JS promise behind it; the callback runs when an item
    // is chosen.
    let responder = Responder::callback(Box::new(|selection| {
        if let Some(id) = selection {
            // The presenter may be inside a modal native call, so the item runs
            // on the main-thread queue rather than inline.
            if let Some(handler) = rn_gpui_sys::DEV_MENU_PERFORM_HANDLER.get() {
                handler(id);
            }
        }
    }));
    let presenter = cx
        .global::<context_menu::ContextMenuPresenterGlobal>()
        .0
        .clone();
    presenter.show(cx, request, responder);
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
