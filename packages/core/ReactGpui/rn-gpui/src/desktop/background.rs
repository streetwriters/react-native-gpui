//! A run that must not disturb the person using the machine.
//!
//! With the test driver on, or `RN_GPUI_BACKGROUND=1`, the app never activates
//! itself, never becomes the frontmost application, and puts its windows behind
//! everything else instead of in front. Focus is logical: `setWindowActive`
//! gives a window focus and key events without the operating system's help.
//! `RN_GPUI_BACKGROUND=0` turns it off for a test run someone is watching.

use gpui::WindowOptions;
use std::sync::OnceLock;

/// Whether this run stays in the background.
pub fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        resolve(
            std::env::var("RN_GPUI_BACKGROUND").ok().as_deref(),
            cfg!(feature = "test-driver")
                && std::env::var_os("RN_GPUI_TEST_DRIVER").is_some_and(|value| value != "0"),
        )
    })
}

fn resolve(background: Option<&str>, driver: bool) -> bool {
    match background {
        Some(value) => !matches!(value, "" | "0" | "false" | "no"),
        None => driver,
    }
}

#[cfg(test)]
mod tests {
    use super::resolve;

    #[test]
    fn the_test_driver_turns_it_on_and_the_variable_decides_either_way() {
        assert!(resolve(None, true));
        assert!(!resolve(None, false));
        assert!(resolve(Some("1"), false));
        assert!(!resolve(Some("0"), true));
    }
}

/// Changes a window's options so that opening it takes no focus and shows
/// nothing in front. Returns whether the window is to be shown behind the
/// others once it is open (see [`show_behind`]).
pub fn prepare(options: &mut WindowOptions) -> bool {
    if !enabled() {
        return false;
    }
    options.focus = false;
    if cfg!(target_os = "macos") {
        let visible = options.show;
        options.show = false;
        return visible;
    }
    false
}

/// Shows a window that [`prepare`] opened hidden, behind the others.
pub fn show_behind(window: &mut gpui::Window) {
    if let Err(error) = super::platform_window::show_behind(window) {
        log::debug!("[background] could not show a window behind the others: {error}");
    }
}

/// The display a test window opens on: `RN_GPUI_TEST_DISPLAY` names an index
/// into the platform's list of displays, `main`, or `secondary`. A background
/// run opens on the secondary display when there is one. A display that does
/// not exist falls back to the main one, with a log line.
pub fn test_display(cx: &gpui::App) -> Option<std::rc::Rc<dyn gpui::PlatformDisplay>> {
    let requested = std::env::var("RN_GPUI_TEST_DISPLAY").ok();
    if requested.is_none() && !enabled() {
        return None;
    }
    let displays = cx.displays();
    let primary = cx.primary_display()?;
    let wanted = requested.as_deref().unwrap_or("secondary");
    let chosen = match wanted {
        "main" | "primary" => Some(primary.clone()),
        "secondary" => displays
            .iter()
            .find(|display| display.id() != primary.id())
            .cloned(),
        index => index
            .parse::<usize>()
            .ok()
            .and_then(|index| displays.get(index).cloned()),
    };
    match chosen {
        Some(display) => Some(display),
        None => {
            if requested.is_some() {
                log::info!(
                    "[background] RN_GPUI_TEST_DISPLAY={wanted} names no display of {}; using the main display",
                    displays.len()
                );
            }
            Some(primary)
        }
    }
}
