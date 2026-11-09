# Changelog

All notable changes to `@react-native-gpui/testing` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- `launchApp` sets `RN_GPUI_DEV_PORT=1` when it is given a bundle and the environment does not set it, so the app loads the bundle at once instead of trying a dev server first.
- `app.raiseWindow()` puts the window in front of the other windows without activating the app, for a test that reads the screen. Needs a runtime built with the `raiseWindow` driver command.
- `app.scroll` takes `{ lines, modifiers }` as a last argument to send a mouse wheel notch or hold keys, and `app.pinch(tag, delta, phase, modifiers)` sends a trackpad pinch. Both are platform events, so they reach `onWheel` handlers before they scroll. `waitForIdle` waits for a wheel event that is still waiting for its handlers. Needs a runtime built with the change.
- `app.windowReveal()` reports the main window's opacity and what made a window that was hidden opaque after it was shown: `frame` (its first frame was drawn) or `timeout`.
- `app.idleStatus()` lists the pending timers that keep the app from being idle, each with the delay it was set for and the time left. Needs a runtime built with the change.
- `app.layoutStats({ reset })` reports the layout and paint statistics of the window: frames, layout node reuse, style writes, measurements, lines shaped, views built and reused, scroll layer repaints and dirtied tiles, and the time of each phase.
- `app.tooltip()` reports the tooltip set up for the view under the pointer: its text, view and frame, the system's view of it on macOS, and the text of a drawn one.
- `app.dockMenu()` and `app.pressDockMenuItem(index)` read the Dock menu and choose one of its items, on macOS.
- The e2e preset's global setup finds an app binary built into a `target-dir` set in the app's `desktop/.cargo/config.toml`: it asks Cargo for the target directory from the `desktop` folder, so such a project no longer needs `RN_GPUI_TEST_BINARY` set by hand.
- `app.displays()` lists the displays, and `launchApp` sets `RN_GPUI_TEST_SCALE_FACTOR=2` unless the variable is set, so a test run renders at 2x on any display.
- `launchApp` fails a test on macOS if the launched app is the frontmost application once it is idle, so a test run cannot take the user's focus; `frontmostApplicationPid()` is exported. `RN_GPUI_TEST_HEADED=1` or `RN_GPUI_TEST_REAL_FOCUS=1` turns the app's background mode off.
- `app.getProps()` and `app.tree()` report the colors a node paints with: the `hoverStyle`, `activeStyle`, `focusStyle` and other state styles that hold are applied to `backgroundColor`, `opacity`, `borderColors`, `textColor` and the outline. `getProps` also has `baseBackgroundColor`, `baseOpacity` and `states`, the names of the state styles that hold.
- `app.getProps()` is typed and reports the color, line height and letter spacing of each text fragment, `textColor`, `borderColors`, `borderRadii`, `boxShadows`, `textAlign`, `numberOfLines` and the outline's color and offset, and `app.tree()` nodes have `backgroundColor`, `opacity`, `borderColors` and `textColor`.
- `app.press()` accepts the W3C key names (`ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`) as well as GPUI's (`down`, `up`, …), and the app sees `ArrowDown`, not `Arrowdown`.
- `app.mouseMove()` between `app.mouseDown()` and `app.mouseUp()` is a move with the button held, as with a mouse, so a sequence of them drives `onPointerMove` of a pressed view without `app.drag()`.
- Added `app.dragFiles()`, `app.dropFiles()` and `app.dragFilesExit()` to simulate files dragged in from the operating system.
- Added `app.setWindowActive(windowId, active)` to make a window active or inactive as far as the app can tell, without the operating system, so a test of focus does not depend on which application is in front.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- Vitest presets for unit tests and for end-to-end tests of desktop apps.
- A client for the desktop test driver: find views, click, type, read state and take screenshots.
