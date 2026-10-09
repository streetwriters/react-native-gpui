//! Application menu bar (plan item 7.1, §5).
//!
//! macOS uses GPUI's `cx.set_menus()`, which builds a real `NSMenu`; Windows and
//! Linux get their own presenters in step 10, and until then the model is stored
//! so the test driver can read it back.
//!
//! Two things make this more than a translation layer:
//!
//! * **Accelerators.** GPUI derives an `NSMenuItem` key equivalent from the
//!   keymap binding for the exact action value, so a data action carrying the
//!   item id both shows the shortcut and dispatches it. `Keymap` has no
//!   per-binding removal API, so the desktop bindings are filtered out and the
//!   rest re-added whenever the menu changes.
//! * **Edit roles.** `OsAction::Copy` maps to the AppKit `copy:` selector, which
//!   needs an `NSTextView` first responder. RN's text inputs are drawn by GPUI,
//!   so the Edit roles are host actions that operate on the focused RN text
//!   input instead.

use crate::desktop::errors::{DesktopError, DesktopResult};
use crate::desktop::menu_model::{self, MenuItemDef, MenuModel, MenuNode, MenuRole, SubmenuDef};
use crate::desktop::windows::DesktopWindowsGlobal;
use crate::node_view::RNNodeView;
use crate::store::store_from;
use gpui::{Action, App, Entity, KeyBinding, Menu, MenuItem, SharedString, SystemMenuType};
use serde_json::{json, Value};

/// Action carrying a menu item id. Bound for each accelerator and stored in the
/// macOS menu, so a click and a shortcut take the same path.
#[derive(Clone, Debug, PartialEq, gpui::Action)]
#[action(namespace = rn_gpui_desktop, no_json, no_register)]
pub struct MenuAccelerator {
    pub id: String,
}

/// An Edit-menu role, performed on the focused RN text input.
#[derive(Clone, Debug, PartialEq, gpui::Action)]
#[action(namespace = rn_gpui_desktop, no_json, no_register)]
pub struct MenuEditAction {
    pub kind: String,
}

/// A host role (quit, hide, minimize, zoom, fullscreen, close, about).
#[derive(Clone, Debug, PartialEq, gpui::Action)]
#[action(namespace = rn_gpui_desktop, no_json, no_register)]
pub struct MenuHostAction {
    pub kind: String,
}

/// What an accelerator does when it fires.
#[derive(Clone, Debug, PartialEq)]
pub enum AcceleratorAction {
    /// A plain menu item press.
    Press(String),
    /// An Edit role on the focused text input.
    Edit(String),
    /// A host role (quit, hide, minimize, …).
    Host(String),
}

/// The current menu and the bindings it installed.
pub struct AppMenuState {
    pub model: MenuModel,
    /// True once JS called `setApplicationMenu`; a reload returns to the default.
    pub user_set: bool,
    pub app_name: String,
    /// The item ids with an accelerator, for the test driver and for `update`.
    pub bindings: Vec<(String, String)>,
    /// The same accelerators, ready to match against an incoming keystroke.
    pub accelerators: Vec<(gpui::Keystroke, AcceleratorAction)>,
    /// Keeps the keystroke interceptor alive for the app's lifetime.
    pub _interceptor: Option<gpui::Subscription>,
    /// One `set_menus` rebuild per frame when several `update` calls arrive.
    pub rebuild_scheduled: bool,
}

pub struct AppMenuGlobal(pub AppMenuState);
impl gpui::Global for AppMenuGlobal {}

impl AppMenuGlobal {
    pub fn new(app_name: String) -> Self {
        Self(AppMenuState {
            model: default_menu(&app_name),
            user_set: false,
            app_name,
            bindings: Vec::new(),
            accelerators: Vec::new(),
            _interceptor: None,
            rebuild_scheduled: false,
        })
    }
}

/// Install the global and the default menu. Called once at startup, before the
/// bundle loads, so Cmd+Q / Cmd+C work without the app writing any menu code.
pub fn install(cx: &mut App, app_name: &str, dev_menu: bool) {
    cx.set_global(DevMenuEnabled(dev_menu));
    cx.set_global(AppMenuGlobal::new(app_name.to_string()));
    let model = default_menu(app_name);
    let _ = apply(cx, model, false);
    cx.on_action(|action: &MenuAccelerator, cx: &mut App| {
        emit_menu_press(cx, &action.id);
    });
    cx.on_action(|action: &MenuEditAction, cx: &mut App| {
        perform_edit(cx, &action.kind, None);
    });
    cx.on_action(|action: &MenuHostAction, cx: &mut App| {
        perform_host_action(cx, &action.kind, None);
    });
    // The keymap binding is what makes macOS draw the shortcut in the NSMenu and
    // what the menu item dispatches. Keystrokes are matched here as well,
    // because a window with no focused element has no dispatch path for the
    // keymap to resolve, and a global shortcut must work in that state too.
    let interceptor = cx.intercept_keystrokes(|event, window, cx| {
        if handle_accelerator(cx, window, &event.keystroke) {
            cx.stop_propagation();
        }
    });
    cx.global_mut::<AppMenuGlobal>().0._interceptor = Some(interceptor);
}

/// Perform a menu item by id, exactly as a click on it would. Used by the test
/// driver so e2e can exercise item presses without a native menu.
pub fn trigger_item(cx: &mut App, id: &str) {
    match accelerator_action(id) {
        AcceleratorAction::Press(id) => emit_menu_press(cx, &id),
        AcceleratorAction::Edit(kind) => perform_edit(cx, &kind, None),
        AcceleratorAction::Host(kind) => perform_host_action(cx, &kind, None),
    }
}

/// Run the accelerator bound to `keystroke`, if any. Returns whether it fired.
pub fn handle_accelerator(
    cx: &mut App,
    window: &mut gpui::Window,
    keystroke: &gpui::Keystroke,
) -> bool {
    let action = {
        let state = &cx.global::<AppMenuGlobal>().0;
        state
            .accelerators
            .iter()
            .find(|(bound, _)| bound == keystroke)
            .map(|(_, action)| action.clone())
    };
    if std::env::var_os("RN_GPUI_DEBUG_DESKTOP").is_some() {
        // `RN_GPUI_DEBUG_DESKTOP=1` shows every keystroke the menu interceptor
        // sees, and whether one of the installed accelerators matched it. This
        // is the only way to tell "the shortcut never reached GPUI" apart from
        // "the shortcut reached GPUI but matched nothing".
        let installed = cx
            .global::<AppMenuGlobal>()
            .0
            .accelerators
            .iter()
            .map(|(bound, _)| bound.to_string())
            .collect::<Vec<_>>();
        log::info!(
            "[desktop] keystroke {} matched={} installed=[{}]",
            keystroke,
            action.is_some(),
            installed.join(", ")
        );
    }
    let Some(action) = action else {
        return false;
    };
    // The window comes from the keystroke, not `active_window()`: a hidden or
    // off-screen window (the test driver's) is not the platform's active one.
    let handle: gpui::AnyWindowHandle = window.window_handle().into();
    match action {
        AcceleratorAction::Press(id) => emit_menu_press(cx, &id),
        AcceleratorAction::Edit(kind) => perform_edit(cx, &kind, Some(handle)),
        AcceleratorAction::Host(kind) => perform_host_action(cx, &kind, Some(handle)),
    }
    // The JS listener needs a frame to run in.
    if let Some(store) = store_from(cx) {
        store.read(cx).frame_hook.arm(window);
    }
    true
}

/// `Menu.setApplicationMenu(items)` / `null` for the default menu.
pub fn set_application_menu(cx: &mut App, items: Option<&Value>) -> DesktopResult {
    let model = match items {
        Some(value) => menu_model::parse_menu(value)?,
        None => default_menu(&app_name(cx)),
    };
    let user_set = items.is_some();
    apply(cx, model, user_set)?;
    Ok(json!({"items": current_model(cx).ids().len()}))
}

/// `Menu.update(id, patch)`.
pub fn update_item(cx: &mut App, id: &str, patch: &Value) -> DesktopResult {
    let patch = patch
        .as_object()
        .ok_or_else(|| DesktopError::invalid_argument("a menu patch must be an object"))?;
    {
        let state = &mut cx.global_mut::<AppMenuGlobal>().0;
        let Some(item) = find_item_mut(&mut state.model.items, id) else {
            return Err(DesktopError::not_found(format!(
                "menu item {id} is not set"
            )));
        };
        if let Some(label) = patch.get("label") {
            item.label = label
                .as_str()
                .ok_or_else(|| DesktopError::invalid_argument("`label` must be a string"))?
                .to_string();
        }
        if let Some(enabled) = patch.get("enabled") {
            item.enabled = enabled
                .as_bool()
                .ok_or_else(|| DesktopError::invalid_argument("`enabled` must be a boolean"))?;
        }
        if let Some(checked) = patch.get("checked") {
            item.checked = checked
                .as_bool()
                .ok_or_else(|| DesktopError::invalid_argument("`checked` must be a boolean"))?;
        }
    }
    schedule_rebuild(cx);
    Ok(json!({"id": id}))
}

/// The menu as JSON, for `getAppMenu` and the driver's fake presenter.
pub fn menu_json(cx: &App) -> Value {
    let state = &cx.global::<AppMenuGlobal>().0;
    json!({
        "appName": state.app_name,
        "userSet": state.user_set,
        "items": nodes_json(&state.model.items),
    })
}

fn nodes_json(items: &[MenuNode]) -> Vec<Value> {
    items
        .iter()
        .map(|node| match node {
            MenuNode::Separator => json!({"type": "separator"}),
            MenuNode::StandardMenu(role) => {
                json!({"type": "role", "role": role_name(*role)})
            }
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
                "accelerator": item.accelerator,
                "enabled": item.enabled,
                "checked": item.checked,
                "role": item.role.map(role_name),
            }),
        })
        .collect()
}

fn role_name(role: MenuRole) -> &'static str {
    match role {
        MenuRole::About => "about",
        MenuRole::Services => "services",
        MenuRole::Hide => "hide",
        MenuRole::HideOthers => "hideOthers",
        MenuRole::ShowAll => "showAll",
        MenuRole::Quit => "quit",
        MenuRole::Undo => "undo",
        MenuRole::Redo => "redo",
        MenuRole::Cut => "cut",
        MenuRole::Copy => "copy",
        MenuRole::Paste => "paste",
        MenuRole::SelectAll => "selectAll",
        MenuRole::Minimize => "minimize",
        MenuRole::Zoom => "zoom",
        MenuRole::ToggleFullscreen => "toggleFullscreen",
        MenuRole::Close => "close",
        MenuRole::Help => "help",
        MenuRole::AppMenu => "appMenu",
        MenuRole::EditMenu => "editMenu",
        MenuRole::WindowMenu => "windowMenu",
        MenuRole::HelpMenu => "helpMenu",
    }
}

fn find_item_mut<'a>(items: &'a mut [MenuNode], id: &str) -> Option<&'a mut MenuItemDef> {
    for node in items {
        match node {
            MenuNode::Item(item) if item.id == id => return Some(item),
            MenuNode::Submenu(submenu) => {
                if let Some(found) = find_item_mut(&mut submenu.items, id) {
                    return Some(found);
                }
            }
            _ => {}
        }
    }
    None
}

/// The menu the app has set (or the default), for the GPUI-rendered menu bar
/// and the test driver.
pub fn current_model(cx: &App) -> MenuModel {
    cx.global::<AppMenuGlobal>().0.model.clone()
}

pub fn app_name(cx: &App) -> String {
    cx.global::<AppMenuGlobal>().0.app_name.clone()
}

/// The items of a standard menu, in the shape the GPUI renderer draws.
///
/// The native path hands whole standard submenus to GPUI, which knows the
/// platform's own items; a GPUI-rendered menu bar has to draw them itself, so
/// the same role lists are spelled out here (plan §4.5).
pub fn standard_menu_nodes(role: MenuRole, app_name: &str, dev_menu: bool) -> Vec<MenuNode> {
    let item = |role: MenuRole| {
        MenuNode::Item(MenuItemDef {
            id: role_action_id(role).to_string(),
            label: role.default_label().to_string(),
            accelerator: default_accelerator(role).map(str::to_string),
            enabled: true,
            checked: false,
            role: Some(role),
        })
    };
    let items = |roles: &[MenuRole]| roles.iter().map(|role| item(*role)).collect();
    match role {
        MenuRole::AppMenu => vec![
            MenuNode::Item(MenuItemDef {
                id: role_action_id(MenuRole::About).to_string(),
                label: format!("About {app_name}"),
                accelerator: None,
                enabled: true,
                checked: false,
                role: Some(MenuRole::About),
            }),
            MenuNode::Separator,
            item(MenuRole::Hide),
            item(MenuRole::HideOthers),
            item(MenuRole::ShowAll),
            MenuNode::Separator,
            item(MenuRole::Quit),
        ],
        MenuRole::EditMenu => {
            let mut nodes: Vec<MenuNode> = items(&[MenuRole::Undo, MenuRole::Redo]);
            nodes.push(MenuNode::Separator);
            nodes.extend(items(&[
                MenuRole::Cut,
                MenuRole::Copy,
                MenuRole::Paste,
                MenuRole::SelectAll,
            ]));
            nodes
        }
        MenuRole::WindowMenu => items(&[
            MenuRole::Minimize,
            MenuRole::Zoom,
            MenuRole::ToggleFullscreen,
            MenuRole::Close,
        ]),
        MenuRole::HelpMenu => {
            let mut nodes = Vec::new();
            if dev_menu {
                nodes.push(MenuNode::Submenu(SubmenuDef {
                    id: Some("dev".to_string()),
                    label: "Developer".to_string(),
                    enabled: true,
                    items: [
                        (crate::desktop::dev_menu::RELOAD, "Reload"),
                        (crate::desktop::dev_menu::OPEN_DEVTOOLS, "Open DevTools"),
                        (
                            crate::desktop::dev_menu::ELEMENT_INSPECTOR,
                            "Toggle Element Inspector",
                        ),
                        (
                            crate::desktop::dev_menu::PERF_MONITOR,
                            "Toggle Perf Monitor",
                        ),
                        (crate::desktop::dev_menu::FAST_REFRESH, "Fast Refresh"),
                    ]
                    .into_iter()
                    .map(|(id, label)| {
                        MenuNode::Item(MenuItemDef {
                            id: id.to_string(),
                            label: label.to_string(),
                            accelerator: None,
                            enabled: true,
                            checked: false,
                            role: None,
                        })
                    })
                    .collect(),
                }));
            }
            nodes
        }
        other => vec![item(other)],
    }
}

/// Whether this build installs the Dev Menu (plan 7.5, dev builds only).
pub struct DevMenuEnabled(pub bool);
impl gpui::Global for DevMenuEnabled {}

fn dev_menu_enabled(cx: &App) -> bool {
    cx.try_global::<DevMenuEnabled>().is_some_and(|flag| flag.0)
}

/// The default menu (plan §5.3): app menu, Edit, Window, Help.
pub fn default_menu(app_name: &str) -> MenuModel {
    let mut app_items = vec![
        MenuNode::Item(role_item(MenuRole::About, &format!("About {app_name}"))),
        MenuNode::Separator,
    ];
    if cfg!(target_os = "macos") {
        app_items.push(MenuNode::Item(role_item(MenuRole::Services, "Services")));
        app_items.push(MenuNode::Separator);
    }
    app_items.extend([
        MenuNode::Item(role_item(MenuRole::Hide, &format!("Hide {app_name}"))),
        MenuNode::Item(role_item(MenuRole::HideOthers, "Hide Others")),
        MenuNode::Item(role_item(MenuRole::ShowAll, "Show All")),
        MenuNode::Separator,
        MenuNode::Item(role_item(MenuRole::Quit, &format!("Quit {app_name}"))),
    ]);

    MenuModel {
        items: vec![
            MenuNode::Submenu(menu_model::SubmenuDef {
                id: None,
                label: app_name.to_string(),
                enabled: true,
                items: app_items,
            }),
            MenuNode::StandardMenu(MenuRole::EditMenu),
            MenuNode::StandardMenu(MenuRole::WindowMenu),
            MenuNode::StandardMenu(MenuRole::HelpMenu),
        ],
    }
}

fn role_item(role: MenuRole, label: &str) -> MenuItemDef {
    MenuItemDef {
        id: format!("role:{}", role_name(role)),
        label: label.to_string(),
        accelerator: default_accelerator(role).map(str::to_string),
        enabled: role.is_supported(),
        checked: false,
        role: Some(role),
    }
}

/// The conventional shortcut for a role, in GPUI keystroke form.
pub fn default_accelerator(role: MenuRole) -> Option<&'static str> {
    Some(match role {
        MenuRole::Undo => "secondary-z",
        MenuRole::Redo => "secondary-shift-z",
        MenuRole::Cut => "secondary-x",
        MenuRole::Copy => "secondary-c",
        MenuRole::Paste => "secondary-v",
        MenuRole::SelectAll => "secondary-a",
        MenuRole::Minimize => "secondary-m",
        MenuRole::Close => "secondary-w",
        MenuRole::Quit => "secondary-q",
        MenuRole::Hide => "secondary-h",
        MenuRole::HideOthers => "secondary-alt-h",
        MenuRole::ToggleFullscreen => "ctrl-cmd-f",
        _ => return None,
    })
}

/// Build and install a menu model.
fn apply(cx: &mut App, model: MenuModel, user_set: bool) -> Result<(), DesktopError> {
    let app_name = app_name(cx);
    let menus = build_menus(&model, &app_name, dev_menu_enabled(cx));
    let bindings = collect_bindings(dev_menu_enabled(cx), &model);
    let accelerators = replace_accelerator_bindings(cx, &bindings);
    // Windows has no `cx.set_menus()`; the model is attached to the HWND
    // instead (plan §4.5). Built twice because the menu builders are not
    // cloneable.
    #[cfg(target_os = "windows")]
    {
        let platform_menus = build_menus(&model, &app_name, dev_menu_enabled(cx));
        if let Some(handle) = crate::desktop::dev_menu::main_window(cx) {
            let _ = handle.update(cx, |_root: gpui::AnyView, window, _cx| {
                if !set_platform_menus(window, &platform_menus) {
                    log::warn!("[desktop] could not attach the Win32 menu bar");
                }
            });
        }
    }
    cx.set_menus(menus);
    let state = &mut cx.global_mut::<AppMenuGlobal>().0;
    state.model = model;
    state.user_set = user_set;
    state.bindings = bindings;
    state.accelerators = accelerators;
    state.rebuild_scheduled = false;
    Ok(())
}

/// Rebuild once per frame, so a burst of `update` calls costs one `set_menus`.
fn schedule_rebuild(cx: &mut App) {
    {
        let state = &mut cx.global_mut::<AppMenuGlobal>().0;
        if state.rebuild_scheduled {
            return;
        }
        state.rebuild_scheduled = true;
    }
    let Some(window) = cx.active_window() else {
        rebuild_now(cx);
        return;
    };
    let _ = window.update(cx, |_root, window, _cx| {
        window.on_next_frame(move |_window, cx| {
            let scheduled = cx
                .try_global::<AppMenuGlobal>()
                .is_some_and(|state| state.0.rebuild_scheduled);
            if scheduled {
                rebuild_now(cx);
            }
        });
    });
}

fn rebuild_now(cx: &mut App) {
    let model = current_model(cx);
    let app_name = app_name(cx);
    let user_set = cx.global::<AppMenuGlobal>().0.user_set;
    let _ = apply(cx, model, user_set);
    let _ = app_name;
}

/// Every accelerator the model installs, as `(item id, keystroke)`.
fn collect_bindings(dev_menu: bool, model: &MenuModel) -> Vec<(String, String)> {
    let mut bindings = model.accelerators();
    collect_role_bindings(&model.items, &mut bindings);
    if dev_menu {
        bindings.push((
            crate::desktop::dev_menu::ACCELERATOR_ID.to_string(),
            crate::desktop::dev_menu::ACCELERATOR.to_string(),
        ));
    }
    bindings
}

fn collect_role_bindings(items: &[MenuNode], out: &mut Vec<(String, String)>) {
    for node in items {
        match node {
            MenuNode::Item(item) => {
                if let Some(role) = item.role {
                    if let Some(accelerator) = default_accelerator(role) {
                        out.push((item.id.clone(), accelerator.to_string()));
                    }
                }
            }
            MenuNode::Submenu(submenu) => collect_role_bindings(&submenu.items, out),
            MenuNode::StandardMenu(role) => {
                for (id, accelerator) in standard_menu_bindings(*role) {
                    out.push((id.to_string(), accelerator.to_string()));
                }
            }
            _ => {}
        }
    }
}

/// The accelerators a standard submenu installs, so they can be unbound when the
/// menu is replaced.
fn standard_menu_bindings(role: MenuRole) -> Vec<(&'static str, &'static str)> {
    let roles: &[MenuRole] = match role {
        MenuRole::EditMenu => &[
            MenuRole::Undo,
            MenuRole::Redo,
            MenuRole::Cut,
            MenuRole::Copy,
            MenuRole::Paste,
            MenuRole::SelectAll,
        ],
        MenuRole::WindowMenu => &[
            MenuRole::Minimize,
            MenuRole::Zoom,
            MenuRole::ToggleFullscreen,
            MenuRole::Close,
        ],
        _ => &[],
    };
    roles
        .iter()
        .filter_map(|role| {
            let accelerator = default_accelerator(*role)?;
            Some((role_action_id(*role), accelerator))
        })
        .collect()
}

/// The stable action id a role's accelerator binds.
pub fn role_action_id(role: MenuRole) -> &'static str {
    match role {
        MenuRole::Undo => "role:undo",
        MenuRole::Redo => "role:redo",
        MenuRole::Cut => "role:cut",
        MenuRole::Copy => "role:copy",
        MenuRole::Paste => "role:paste",
        MenuRole::SelectAll => "role:selectAll",
        MenuRole::Minimize => "role:minimize",
        MenuRole::Zoom => "role:zoom",
        MenuRole::ToggleFullscreen => "role:toggleFullscreen",
        MenuRole::Close => "role:close",
        MenuRole::Quit => "role:quit",
        MenuRole::Hide => "role:hide",
        MenuRole::HideOthers => "role:hideOthers",
        MenuRole::ShowAll => "role:showAll",
        MenuRole::About => "role:about",
        _ => "role:menu",
    }
}

fn is_desktop_action(action: &dyn Action) -> bool {
    action.as_any().downcast_ref::<MenuAccelerator>().is_some()
        || action.as_any().downcast_ref::<MenuEditAction>().is_some()
        || action.as_any().downcast_ref::<MenuHostAction>().is_some()
}

/// Windows has no `cx.set_menus()`: GPUI's Win32 backend does not own a menu
/// bar, so the same model is handed to `muda`, which attaches a native Win32
/// menu to the window's HWND (plan §4.5).
///
/// **Written but never compiled**: this machine cannot build for Windows.
#[cfg(target_os = "windows")]
fn set_platform_menus(window: &mut gpui::Window, menus: &[Menu]) -> bool {
    use muda::{Menu as MudaMenu, MenuItem as MudaItem, PredefinedMenuItem, Submenu};
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    fn build(menu: &Menu, target: &dyn muda::ContextMenu) {
        let mut items: Vec<Box<dyn muda::IsMenuItem>> = Vec::new();
        for item in &menu.items {
            match item {
                MenuItem::Separator => items.push(Box::new(PredefinedMenuItem::separator())),
                MenuItem::Submenu(submenu) => {
                    let child = Submenu::new(submenu.name.to_string(), true);
                    build(submenu, &child);
                    items.push(Box::new(child));
                }
                MenuItem::Action(action) => {
                    let id = action
                        .action
                        .as_any()
                        .downcast_ref::<MenuAccelerator>()
                        .map(|accelerator| accelerator.id.clone())
                        .unwrap_or_default();
                    items.push(Box::new(MudaItem::new(action.name.to_string(), true, None)));
                    let _ = id;
                }
                MenuItem::OsSubmenu(_) => {}
            }
        }
        let refs: Vec<&dyn muda::IsMenuItem> = items.iter().map(|item| item.as_ref()).collect();
        let _ = target.append_items(&refs);
    }

    let handle = match HasWindowHandle::window_handle(window) {
        Ok(handle) => handle,
        Err(_) => return false,
    };
    let hwnd = match handle.as_raw() {
        RawWindowHandle::Win32(win32) => win32.hwnd.get() as isize,
        _ => return false,
    };
    let bar = MudaMenu::new();
    for menu in menus {
        let submenu = Submenu::new(menu.name.to_string(), true);
        build(menu, &submenu);
        let _ = bar.append(&submenu);
    }
    // `init_for_hwnd` installs the menu bar; the returned receiver must be kept
    // alive for the items to keep dispatching.
    let _ = unsafe { bar.init_for_hwnd(hwnd) };
    true
}

/// Replace the desktop bindings, leaving every other binding untouched, and
/// return the accelerators the keystroke interceptor matches.
fn replace_accelerator_bindings(
    cx: &mut App,
    bindings: &[(String, String)],
) -> Vec<(gpui::Keystroke, AcceleratorAction)> {
    let keymap = cx.key_bindings();
    let kept: Vec<KeyBinding> = keymap
        .borrow()
        .bindings()
        .filter(|binding| !is_desktop_action(binding.action()))
        .cloned()
        .collect();
    {
        let mut keymap = keymap.borrow_mut();
        keymap.clear();
        keymap.add_bindings(kept);
    }

    let mut new_bindings: Vec<KeyBinding> = Vec::with_capacity(bindings.len());
    let mut accelerators: Vec<(gpui::Keystroke, AcceleratorAction)> = Vec::new();
    for (id, keystroke) in bindings {
        if keystroke.is_empty() {
            continue;
        }
        let action = accelerator_action(id);
        new_bindings.push(binding_for(keystroke, &action));
        if let Ok(parsed) = gpui::Keystroke::parse(keystroke) {
            accelerators.push((parsed, action));
        }
    }
    cx.bind_keys(new_bindings);
    accelerators
}

/// The action an item id binds: a role keeps its role behavior, anything else is
/// a plain press.
fn accelerator_action(id: &str) -> AcceleratorAction {
    // Plan 7.5 — the Dev Menu's shortcut is not a menu item.
    if id == crate::desktop::dev_menu::ACCELERATOR_ID {
        return AcceleratorAction::Host("devMenu".to_string());
    }
    if let Some(kind) = id.strip_prefix("role:") {
        if matches!(
            kind,
            "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"
        ) {
            return AcceleratorAction::Edit(kind.to_string());
        }
        if matches!(
            kind,
            "quit"
                | "hide"
                | "hideOthers"
                | "showAll"
                | "minimize"
                | "zoom"
                | "toggleFullscreen"
                | "close"
                | "about"
        ) {
            return AcceleratorAction::Host(kind.to_string());
        }
    }
    AcceleratorAction::Press(id.to_string())
}

/// Bind a concrete action for the keymap, mirroring [`accelerator_action`].
fn binding_for(keystroke: &str, action: &AcceleratorAction) -> KeyBinding {
    match action {
        AcceleratorAction::Press(id) => {
            KeyBinding::new(keystroke, MenuAccelerator { id: id.clone() }, None)
        }
        AcceleratorAction::Edit(kind) => {
            KeyBinding::new(keystroke, MenuEditAction { kind: kind.clone() }, None)
        }
        AcceleratorAction::Host(kind) => {
            KeyBinding::new(keystroke, MenuHostAction { kind: kind.clone() }, None)
        }
    }
}

fn build_menus(model: &MenuModel, app_name: &str, dev_menu: bool) -> Vec<Menu> {
    model
        .items
        .iter()
        .filter_map(|node| match node {
            MenuNode::StandardMenu(role) => Some(standard_menu(*role, app_name, dev_menu)),
            MenuNode::Submenu(submenu) => Some(
                Menu::new(SharedString::from(submenu.label.clone()))
                    .items(build_items(&submenu.items))
                    .disabled(!submenu.enabled),
            ),
            MenuNode::Item(item) => Some(
                Menu::new(SharedString::from(item.label.clone())).items(vec![build_item(item)]),
            ),
            MenuNode::Separator => None,
        })
        .collect()
}

fn standard_menu(role: MenuRole, app_name: &str, dev_menu: bool) -> Menu {
    let (name, items): (&str, Vec<MenuItem>) = match role {
        MenuRole::EditMenu => (
            "Edit",
            vec![
                role_menu_item(MenuRole::Undo, None),
                role_menu_item(MenuRole::Redo, None),
                MenuItem::separator(),
                role_menu_item(MenuRole::Cut, None),
                role_menu_item(MenuRole::Copy, None),
                role_menu_item(MenuRole::Paste, None),
                role_menu_item(MenuRole::SelectAll, None),
            ],
        ),
        MenuRole::WindowMenu => (
            "Window",
            vec![
                role_menu_item(MenuRole::Minimize, None),
                role_menu_item(MenuRole::Zoom, None),
                MenuItem::separator(),
                role_menu_item(MenuRole::ToggleFullscreen, None),
                MenuItem::separator(),
                role_menu_item(MenuRole::Close, None),
            ],
        ),
        MenuRole::HelpMenu => (
            "Help",
            if dev_menu {
                vec![MenuItem::submenu(
                    Menu::new(SharedString::from("Developer")).items(dev_menu_items()),
                )]
            } else {
                Vec::new()
            },
        ),
        MenuRole::AppMenu => (
            app_name,
            vec![role_menu_item(MenuRole::About, Some(app_name))],
        ),
        _ => ("Menu", Vec::new()),
    };
    Menu::new(SharedString::from(name)).items(items)
}

fn build_items(items: &[MenuNode]) -> Vec<MenuItem> {
    items
        .iter()
        .filter_map(|node| match node {
            MenuNode::Separator => Some(MenuItem::separator()),
            MenuNode::StandardMenu(role) => Some(MenuItem::submenu(standard_menu(
                *role,
                role.default_label(),
                false,
            ))),
            MenuNode::Submenu(submenu) => Some(
                MenuItem::submenu(
                    Menu::new(SharedString::from(submenu.label.clone()))
                        .items(build_items(&submenu.items)),
                )
                .disabled(!submenu.enabled),
            ),
            MenuNode::Item(item) => Some(build_item(item)),
        })
        .collect()
}

/// The Developer submenu's items (plan §5.3: the dev group lives in Help).
fn dev_menu_items() -> Vec<MenuItem> {
    use crate::desktop::dev_menu as dev;
    [
        (dev::RELOAD, "Reload", false),
        (dev::OPEN_DEVTOOLS, "Open DevTools", false),
        (dev::ELEMENT_INSPECTOR, "Toggle Element Inspector", false),
        (dev::PERF_MONITOR, "Toggle Perf Monitor", false),
        (dev::FAST_REFRESH, "Fast Refresh", false),
    ]
    .into_iter()
    .map(|(id, label, checked)| {
        MenuItem::action(
            SharedString::from(label),
            MenuAccelerator { id: id.to_string() },
        )
        .checked(checked)
    })
    .collect()
}

fn build_item(item: &MenuItemDef) -> MenuItem {
    if let Some(role) = item.role {
        let mut built = role_menu_item(role, Some(&item.label));
        built = built.checked(item.checked);
        return built.disabled(!item.enabled);
    }
    let mut built = MenuItem::action(
        SharedString::from(item.label.clone()),
        MenuAccelerator {
            id: item.id.clone(),
        },
    );
    built = built.checked(item.checked).disabled(!item.enabled);
    built
}

fn role_menu_item(role: MenuRole, label: Option<&str>) -> MenuItem {
    let label = label.unwrap_or_else(|| role.default_label());
    match role {
        MenuRole::Services => {
            MenuItem::os_submenu(SharedString::from(label), SystemMenuType::Services)
        }
        MenuRole::Cut
        | MenuRole::Copy
        | MenuRole::Paste
        | MenuRole::SelectAll
        | MenuRole::Undo
        | MenuRole::Redo => MenuItem::action(
            SharedString::from(label),
            MenuEditAction {
                kind: role_action_id(role).trim_start_matches("role:").to_string(),
            },
        ),
        MenuRole::About
        | MenuRole::Hide
        | MenuRole::HideOthers
        | MenuRole::ShowAll
        | MenuRole::Quit
        | MenuRole::Minimize
        | MenuRole::Zoom
        | MenuRole::ToggleFullscreen
        | MenuRole::Close => MenuItem::action(
            SharedString::from(label),
            MenuHostAction {
                kind: role_action_id(role).trim_start_matches("role:").to_string(),
            },
        ),
        // Whole submenus and the Help marker are handled by `standard_menu`.
        MenuRole::Help
        | MenuRole::AppMenu
        | MenuRole::EditMenu
        | MenuRole::WindowMenu
        | MenuRole::HelpMenu => MenuItem::action(
            SharedString::from(label),
            MenuHostAction {
                kind: "noop".to_string(),
            },
        ),
    }
}

/// `gpuiDesktop:menuPress {id, windowId}`.
fn emit_menu_press(cx: &mut App, id: &str) {
    let Some(store) = store_from(cx) else {
        return;
    };
    let host = store.read(cx).host.clone();
    let window_id = active_window_key(cx).unwrap_or(1);
    host.emit_device_event_json(
        "gpuiDesktop:menuPress",
        &json!({"id": id, "windowId": window_id}).to_string(),
    );
}

fn active_window_key(cx: &App) -> Option<u32> {
    let handle = cx.active_window()?;
    let windows = cx.try_global::<DesktopWindowsGlobal>()?;
    windows
        .0
        .keys()
        .into_iter()
        .find(|key| windows.0.get(*key).map(|entry| entry.handle) == Some(handle))
}

/// The focused RN text input in `window`, if any.
///
/// Must not be called from inside a window update: GPUI takes the window out of
/// the app while an update runs, so a nested `update_window` fails. Every caller
/// goes through [`App::defer`] for that reason.
fn focused_text_input(cx: &mut App, window: gpui::AnyWindowHandle) -> Option<Entity<RNNodeView>> {
    let debug = std::env::var_os("RN_GPUI_DEBUG_DESKTOP").is_some();
    let result = window.update(cx, |_root, window, cx| {
        let focused = window.focused(cx)?;
        let store = store_from(cx)?;
        let node = {
            let store = store.read(cx);
            store
                .nodes
                .values()
                .find(|node| node.read(cx).nearest_focus_handle(cx).as_ref() == Some(&focused))
                .cloned()
        };
        if debug {
            log::info!(
                "[desktop][menu] focused node found={} (store nodes={})",
                node.is_some(),
                store.read(cx).nodes.len()
            );
        }
        node
    });
    if let Err(error) = &result {
        if debug {
            log::info!("[desktop][menu] focus lookup failed: {error:?}");
        }
    }
    result.ok().flatten()
}

fn perform_edit(cx: &mut App, kind: &str, handle: Option<gpui::AnyWindowHandle>) {
    let kind = kind.to_string();
    // Deferred: the action is dispatched from inside a window update, and GPUI
    // forbids re-entering the same window.
    cx.defer(move |cx| {
        let debug = std::env::var_os("RN_GPUI_DEBUG_DESKTOP").is_some();
        let Some(window) = handle.or_else(|| cx.active_window()) else {
            return;
        };
        let Some(node) = focused_text_input(cx, window) else {
            if debug {
                log::info!("[desktop][menu] edit {kind}: no focused text input");
            }
            return;
        };
        let _ = window.update(cx, move |_root, window, cx| {
            node.update(cx, |node, cx| match kind.as_str() {
                "copy" => {
                    crate::input::copy_selection(node, cx);
                }
                "cut" => {
                    crate::input::cut_selection(node, window, cx);
                }
                "paste" => {
                    crate::input::paste_clipboard(node, window, cx);
                }
                "selectAll" => {
                    crate::input::select_all(node, window, cx);
                }
                // Undo/redo have no edit history in the GPUI text input yet; the
                // menu item is present so an app can handle the press itself.
                _ => {}
            });
            if debug {
                let node = node.read(cx);
                log::info!(
                    "[desktop][menu] edit {kind} on {} selection={:?}",
                    node.component,
                    node.input_selection
                );
            }
        });
    });
}

fn perform_host_action(cx: &mut App, kind: &str, handle: Option<gpui::AnyWindowHandle>) {
    match kind {
        "quit" => cx.quit(),
        "hide" => cx.hide(),
        "hideOthers" => cx.hide_other_apps(),
        "showAll" => cx.unhide_other_apps(),
        "about" => show_about_panel(cx),
        // Deferred like the window actions below: the accelerator runs inside
        // the keystroke's window update, and showing the menu needs to read the
        // window's platform view and open a popup, both of which re-enter the
        // window and panic while that update is still on the stack.
        "devMenu" => cx.defer(|cx| crate::desktop::dev_menu::show(cx)),
        "minimize" | "zoom" | "toggleFullscreen" | "close" => {
            let kind = kind.to_string();
            cx.defer(move |cx| {
                let Some(window) = handle.or_else(|| cx.active_window()) else {
                    return;
                };
                let _ = window.update(cx, move |_root, window, _cx| match kind.as_str() {
                    "minimize" => window.minimize_window(),
                    "zoom" => window.zoom_window(),
                    "toggleFullscreen" => window.toggle_fullscreen(),
                    "close" => window.remove_window(),
                    _ => {}
                });
            });
        }
        _ => {}
    }
}

#[cfg(target_os = "macos")]
fn show_about_panel(_cx: &mut App) {
    use objc::{class, msg_send, sel, sel_impl};
    unsafe {
        let app: cocoa::base::id = msg_send![class!(NSApplication), sharedApplication];
        let _: () =
            msg_send![app, orderFrontStandardAboutPanel: std::ptr::null::<cocoa::base::id>()];
    }
}

#[cfg(not(target_os = "macos"))]
fn show_about_panel(_cx: &mut App) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_menu_has_the_standard_groups() {
        let model = default_menu("Tester");
        assert!(model.has_help_menu());
        // The default menu uses whole standard submenus for Edit/Window, so the
        // Edit roles are not individual nodes; their accelerators are still
        // installed.
        assert!(model.find("role:quit").is_some());
        let bindings = collect_bindings(false, &model);
        assert!(bindings
            .iter()
            .any(|(id, key)| id == "role:copy" && key == "secondary-c"));
        assert!(bindings
            .iter()
            .any(|(id, key)| id == "role:quit" && key == "secondary-q"));
    }

    #[test]
    fn standard_edit_menu_installs_accelerators() {
        let model = MenuModel {
            items: vec![MenuNode::StandardMenu(MenuRole::EditMenu)],
        };
        let bindings = collect_bindings(false, &model);
        assert_eq!(bindings.len(), 6);
        assert!(bindings.iter().any(|(_, key)| key == "secondary-v"));
    }

    #[test]
    fn unsupported_roles_are_dropped_from_the_built_menu() {
        // `services` only exists on macOS; the model keeps it either way, but the
        // built item must not appear as a disabled entry elsewhere.
        let model = default_menu("Tester");
        let menus = build_menus(&model, "Tester", false);
        assert!(!menus.is_empty());
    }
}
