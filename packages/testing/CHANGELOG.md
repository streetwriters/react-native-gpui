# Changelog

All notable changes to `@react-native-gpui/testing` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- `app.press()` accepts the W3C key names (`ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`) as well as GPUI's (`down`, `up`, …), and the app sees `ArrowDown`, not `Arrowdown`.
- `app.mouseMove()` between `app.mouseDown()` and `app.mouseUp()` is a move with the button held, as with a mouse, so a sequence of them drives `onPointerMove` of a pressed view without `app.drag()`.
- Added `app.dragFiles()`, `app.dropFiles()` and `app.dragFilesExit()` to simulate files dragged in from the operating system.
- Added `app.setWindowActive(windowId, active)` to make a window active or inactive as far as the app can tell, without the operating system, so a test of focus does not depend on which application is in front.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- Vitest presets for unit tests and for end-to-end tests of desktop apps.
- A client for the desktop test driver: find views, click, type, read state and take screenshots.
