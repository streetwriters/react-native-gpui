# Changelog

All notable changes to `@react-native-gpui/testing` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- `launchApp` sets `RN_GPUI_DEV_PORT=1` when it is given a bundle and the environment does not set it, so the app loads the bundle at once instead of trying a dev server first.
- `app.mouseMove()` between `app.mouseDown()` and `app.mouseUp()` is a move with the button held, as with a mouse, so a sequence of them drives `onPointerMove` of a pressed view without `app.drag()`.
- Added `app.dragFiles()`, `app.dropFiles()` and `app.dragFilesExit()` to simulate files dragged in from the operating system.
- Added `app.setWindowActive(windowId, active)` to make a window active or inactive as far as the app can tell, without the operating system, so a test of focus does not depend on which application is in front.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- Vitest presets for unit tests and for end-to-end tests of desktop apps.
- A client for the desktop test driver: find views, click, type, read state and take screenshots.
