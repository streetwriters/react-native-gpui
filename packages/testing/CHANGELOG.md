# Changelog

All notable changes to `@react-native-gpui/testing` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- `launchApp` sets `RN_GPUI_DEV_PORT=1` when it is given a bundle and the environment does not set it, so the app loads the bundle at once instead of trying a dev server first.
- `app.raiseWindow()` puts the window in front of the other windows without activating the app, for a test that reads the screen. Needs a runtime built with the `raiseWindow` driver command.
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
