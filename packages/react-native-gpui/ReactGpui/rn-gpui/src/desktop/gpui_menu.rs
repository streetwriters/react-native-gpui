//! A GPUI-rendered context menu (plan §6.3, the Linux answer).
//!
//! Linux has no native popup menu GPUI can use: `muda` needs a GTK window, and
//! GPUI's X11/Wayland windows are not GTK. The plan therefore renders the menu
//! with GPUI. This is that renderer, and it is also selectable on macOS and
//! Windows with `RN_GPUI_CONTEXT_MENU=gpui`, which is how it is tested.
//!
//! The menu is a parent-anchored popup window ([`gpui::WindowKind::AnchoredPopup`]),
//! so the platform places it next to the anchor rectangle and keeps it on
//! screen. Submenus open as popups parented to the menu that opened them.

use crate::desktop::context_menu::{ContextMenuRequest, Responder};
use crate::desktop::menu_model::{MenuModel, MenuNode};
use gpui::{
    point, px, size, App, AppContext, Bounds, Context, InteractiveElement, IntoElement,
    ParentElement, Render, Styled, Window, WindowBounds, WindowKind, WindowOptions,
};
use std::cell::RefCell;

/// One row is this tall; the popup window is sized from the item count.
const ROW_HEIGHT: f32 = 26.0;
const PADDING: f32 = 6.0;
const MIN_WIDTH: f32 = 160.0;
const MAX_WIDTH: f32 = 420.0;

/// The popup that is currently open, so the test driver can drive it: a GPUI
/// popup window's elements are not React Native nodes, so the normal driver
/// click path cannot reach them.
pub struct PendingMenu {
    pub window: gpui::AnyWindowHandle,
    pub items: Vec<MenuNode>,
    pub responder: Responder,
}

pub struct PendingMenuGlobal(pub RefCell<Option<PendingMenu>>);
impl gpui::Global for PendingMenuGlobal {}

/// Whether this build draws context menus with GPUI.
///
/// `RN_GPUI_CONTEXT_MENU=gpui` forces it on, `=native` forces it off; the
/// default is on for Linux, where there is no native alternative.
pub fn should_use_gpui() -> bool {
    match std::env::var("RN_GPUI_CONTEXT_MENU").ok().as_deref() {
        Some("gpui") => true,
        Some("native") => false,
        _ => cfg!(target_os = "linux"),
    }
}

/// Show `request` as a GPUI popup window and settle `responder` when it closes.
pub fn present(
    cx: &mut App,
    request: ContextMenuRequest,
    responder: Responder,
) -> Result<(), String> {
    let window = open_menu_window(
        cx,
        request.window,
        (request.x, request.y),
        request.model.items.clone(),
        responder.clone(),
        0,
    )?;
    cx.set_global(PendingMenuGlobal(RefCell::new(Some(PendingMenu {
        window,
        items: request.model.items,
        responder,
    }))));
    Ok(())
}

/// Open one dropdown.
///
/// `AnchoredPopup` is the right window kind — the platform places it next to the
/// anchor and keeps it on screen — but macOS rejects it ("native popups are not
/// implemented on macOS yet"), so the fallback is a floating window placed at
/// the anchor's screen position. Linux (X11 and Wayland) and Windows take the
/// anchored path, which is what the plan asks for there.
fn open_menu_window(
    cx: &mut App,
    parent: gpui::AnyWindowHandle,
    anchor: (f32, f32),
    items: Vec<MenuNode>,
    responder: Responder,
    depth: usize,
) -> Result<gpui::AnyWindowHandle, String> {
    let (width, height) = popup_size(&MenuModel {
        items: items.clone(),
    });
    let popup_options = gpui::popup::PopupOptions {
        parent,
        anchor_rect: Bounds::new(point(px(anchor.0), px(anchor.1)), size(px(1.0), px(1.0))),
        anchor: if depth == 0 {
            gpui::popup::PopupAnchor::BottomLeft
        } else {
            gpui::popup::PopupAnchor::TopRight
        },
        gravity: gpui::popup::PopupGravity::BottomRight,
        constraint_adjustment: gpui::popup::PopupConstraintAdjustment::SLIDE_X
            | gpui::popup::PopupConstraintAdjustment::SLIDE_Y
            | gpui::popup::PopupConstraintAdjustment::FLIP_X
            | gpui::popup::PopupConstraintAdjustment::FLIP_Y,
        offset: point(px(0.0), px(0.0)),
        // Only the outermost menu grabs input; a submenu is dismissed with its
        // parent.
        grab: depth == 0,
    };
    let anchored_items = items.clone();
    let anchored_responder = responder.clone();
    let anchored = cx.open_window(
        WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                point(px(0.0), px(0.0)),
                size(px(width), px(height)),
            ))),
            kind: WindowKind::AnchoredPopup(popup_options),
            is_resizable: false,
            ..Default::default()
        },
        move |_window, cx| cx.new(|_| MenuPopup::new(anchored_items, anchored_responder, depth)),
    );
    if let Ok(handle) = anchored {
        let window: gpui::AnyWindowHandle = handle.into();
        log::info!("[gpui-menu] anchored popup {window:?} ({width}x{height})");
        return Ok(window);
    }

    // The anchor's position in screen coordinates, from the window it is
    // relative to.
    let origin = parent
        .update(cx, |_root: gpui::AnyView, window, _cx| {
            let bounds = window.bounds();
            (
                f32::from(bounds.origin.x) + anchor.0,
                f32::from(bounds.origin.y) + anchor.1,
            )
        })
        .map_err(|error| format!("the menu's window is gone: {error}"))?;
    let floating = cx
        .open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(origin.0), px(origin.1)),
                    size(px(width), px(height)),
                ))),
                kind: WindowKind::PopUp,
                is_resizable: false,
                ..Default::default()
            },
            move |_window, cx| cx.new(|_| MenuPopup::new(items, responder, depth)),
        )
        .map_err(|error| format!("could not open the menu popup: {error}"))?;
    let window: gpui::AnyWindowHandle = floating.into();
    log::info!("[gpui-menu] floating popup {window:?} at {origin:?}");
    Ok(window)
}

/// The popup window's size, estimated from the widest label.
fn popup_size(model: &MenuModel) -> (f32, f32) {
    let mut rows = 0usize;
    let mut widest = 0usize;
    fn walk(items: &[MenuNode], rows: &mut usize, widest: &mut usize) {
        for node in items {
            *rows += 1;
            match node {
                MenuNode::Item(item) => {
                    let mut width = item.label.chars().count();
                    if let Some(accelerator) = &item.accelerator {
                        width += accelerator.chars().count() + 4;
                    }
                    *widest = (*widest).max(width);
                }
                MenuNode::Submenu(submenu) => {
                    *widest = (*widest).max(submenu.label.chars().count() + 2);
                }
                _ => {}
            }
        }
    }
    walk(&model.items, &mut rows, &mut widest);
    let width = (widest as f32 * 8.0 + PADDING * 2.0 + 28.0).clamp(MIN_WIDTH, MAX_WIDTH);
    let height = (rows as f32 * ROW_HEIGHT + PADDING * 2.0).max(ROW_HEIGHT);
    (width, height)
}

/// One dropdown, in its own popup window. `depth` is 0 for the top level.
pub struct MenuPopup {
    items: Vec<MenuNode>,
    responder: Responder,
    depth: usize,
    /// Set when this popup resolved the request, so a parent popup does not
    /// resolve it a second time.
    resolved: bool,
}

impl MenuPopup {
    fn new(items: Vec<MenuNode>, responder: Responder, depth: usize) -> Self {
        Self {
            items,
            responder,
            depth,
            resolved: false,
        }
    }

    fn close(window: &mut Window) {
        window.remove_window();
    }

    fn choose(&mut self, id: &str, window: &mut Window) {
        if self.resolved {
            return;
        }
        self.resolved = true;
        self.responder.resolve(Some(id));
        Self::close(window);
    }

    /// The open popup, for the driver: `(window, items)`.
    pub fn pending(cx: &App) -> Option<(gpui::AnyWindowHandle, Vec<MenuNode>)> {
        cx.try_global::<PendingMenuGlobal>().and_then(|pending| {
            pending
                .0
                .borrow()
                .as_ref()
                .map(|menu| (menu.window, menu.items.clone()))
        })
    }

    /// Settle the open popup as if `id` had been chosen, and close its window.
    pub fn select(cx: &mut App, id: &str) -> bool {
        let Some(pending) = cx.try_global::<PendingMenuGlobal>() else {
            return false;
        };
        let taken = pending.0.borrow_mut().take();
        let Some(menu) = taken else {
            return false;
        };
        menu.responder.resolve(Some(id));
        let _ = menu
            .window
            .update(cx, |_root, window, _cx| window.remove_window());
        true
    }

    /// Dismiss the open popup, resolving `null`.
    pub fn dismiss(cx: &mut App) -> bool {
        let Some(pending) = cx.try_global::<PendingMenuGlobal>() else {
            return false;
        };
        let taken = pending.0.borrow_mut().take();
        let Some(menu) = taken else {
            return false;
        };
        menu.responder.resolve(None);
        let _ = menu
            .window
            .update(cx, |_root, window, _cx| window.remove_window());
        true
    }

    /// Open `items` as a popup anchored at the click that asked for it.
    fn open_submenu(
        &self,
        items: Vec<MenuNode>,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let parent: gpui::AnyWindowHandle = window.window_handle();
        let responder = self.responder.clone();
        let depth = self.depth + 1;
        if let Err(error) = open_menu_window(cx, parent, (x, y), items, responder, depth) {
            log::error!("[gpui-menu] {error}");
        }
    }
}

impl Render for MenuPopup {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut rows: Vec<gpui::AnyElement> = Vec::new();
        for (index, node) in self.items.clone().into_iter().enumerate() {
            match node {
                MenuNode::Separator => {
                    rows.push(
                        gpui::div()
                            .h(px(1.0))
                            .mx_2()
                            .my_1()
                            .bg(gpui::rgba(0x00000022))
                            .into_any_element(),
                    );
                }
                MenuNode::StandardMenu(_) => {}
                MenuNode::Item(item) => {
                    let id = item.id.clone();
                    let enabled = item.enabled;
                    let mut row = gpui::div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .gap_4()
                        .px_2()
                        .h(px(ROW_HEIGHT))
                        .text_size(px(13.0))
                        .child(
                            gpui::div()
                                .flex()
                                .flex_row()
                                .gap_1()
                                .child(if item.checked { "✓" } else { " " })
                                .child(item.label.clone()),
                        )
                        .child(
                            gpui::div()
                                .text_color(gpui::rgba(0x00000088))
                                .child(item.accelerator.clone().unwrap_or_default()),
                        );
                    if !enabled {
                        row = row.text_color(gpui::rgba(0x00000066));
                    } else {
                        row = row
                            .cursor_pointer()
                            .hover(|style| style.bg(gpui::rgba(0x00000011)))
                            .on_mouse_down(
                                gpui::MouseButton::Left,
                                cx.listener(move |this, _event, window, _cx| {
                                    this.choose(&id, window);
                                }),
                            );
                    }
                    let _ = index;
                    rows.push(row.into_any_element());
                }
                MenuNode::Submenu(submenu) => {
                    let items = submenu.items.clone();
                    let enabled = submenu.enabled;
                    let mut row = gpui::div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .px_2()
                        .h(px(ROW_HEIGHT))
                        .text_size(px(13.0))
                        .child(submenu.label.clone())
                        .child("›");
                    if enabled {
                        row = row
                            .cursor_pointer()
                            .hover(|style| style.bg(gpui::rgba(0x00000011)))
                            .on_mouse_down(
                                gpui::MouseButton::Left,
                                cx.listener(
                                    move |this, event: &gpui::MouseDownEvent, window, cx| {
                                        this.open_submenu(
                                            items.clone(),
                                            f32::from(event.position.x),
                                            f32::from(event.position.y),
                                            window,
                                            cx,
                                        );
                                    },
                                ),
                            );
                    }
                    rows.push(row.into_any_element());
                }
            }
        }

        // Escape dismisses the menu with `null`, like a native one.
        let responder = self.responder.clone();
        let resolved = self.resolved;
        let _ = window;

        gpui::div()
            .flex()
            .flex_col()
            .py(px(PADDING))
            .bg(gpui::white())
            .border_1()
            .border_color(gpui::rgba(0x00000033))
            .rounded(px(6.0))
            .shadow_md()
            .text_color(gpui::rgb(0x18212f))
            .on_key_down(move |event, window, _cx| {
                if event.keystroke.key == "escape" {
                    if !resolved {
                        responder.resolve(None);
                    }
                    window.remove_window();
                }
            })
            .children(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::menu_model;
    use serde_json::json;

    #[test]
    fn popup_size_grows_with_the_items() {
        let one = menu_model::parse_menu(&json!([{"id": "a", "label": "A"}])).expect("valid");
        let two = menu_model::parse_menu(&json!([
            {"id": "a", "label": "A"},
            {"type": "separator"},
            {"id": "b", "label": "B"}
        ]))
        .expect("valid");
        let (_, one_height) = popup_size(&one);
        let (_, two_height) = popup_size(&two);
        assert!(two_height > one_height);
    }

    #[test]
    fn popup_width_is_clamped() {
        let wide = menu_model::parse_menu(&json!([{
            "id": "a",
            "label": "a very long label that would otherwise make the popup enormous indeed"
        }]))
        .expect("valid");
        let (width, _) = popup_size(&wide);
        assert_eq!(width, MAX_WIDTH);
    }

    #[test]
    fn the_mode_follows_the_environment() {
        // The default is platform-derived; the override is what tests use.
        std::env::set_var("RN_GPUI_CONTEXT_MENU", "gpui");
        assert!(should_use_gpui());
        std::env::set_var("RN_GPUI_CONTEXT_MENU", "native");
        assert!(!should_use_gpui());
        std::env::remove_var("RN_GPUI_CONTEXT_MENU");
    }
}
