# Changelog

All notable changes to `@react-native-gpui/cli` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- `run-desktop --release` and `package-desktop` collect the Node addons the release bundle loads into `desktop/build/node-addons` without a separate `collect-node-addons` step. A release run copies them beside the executable, and a packaged macOS app ships them as `Resources/node-addons`, with each shared library beside its addon. When `APPLE_SIGNING_IDENTITY` is set on macOS, the collected `.node` and `.dylib` files are signed with it, as the app is. A debug build collects nothing.
- `desktop.json` accepts `window.visible`, which starts the main window hidden until the app shows it.
- Autolink records the window options and flags of `desktop/desktop.json`, merged with the per-OS file, in the generated autolink crate, and `ensure_linked()` hands them to the runtime, so `window.titleBar`, `window.trafficLightPosition` and the other window keys apply to a hand-written `main.rs` without running `init-desktop` again.
- `package-desktop` tells the engine which build it packages, so a release app ships the Hermes VM without the debugger.
- `run-desktop` on macOS signs the app with `APPLE_SIGNING_IDENTITY` when it is set, so the keychain keeps the access it granted across rebuilds instead of asking for every item again.

## 0.87.0-alpha.1 - 2026-11-05

- `package-desktop` tries `cargo packager` again, up to four times with a growing pause, when it fails because `hdiutil` reports `create failed - Resource busy` while building a disk image, or because a download it needs answers with a 5xx status or times out. Packaging failed at random on these.
- `desktop.json` accepts `tray.popoverAnchor` and `tray.popoverOffset`, the corner and offset of a tray popover on Linux with Wayland.
- `desktop.json` accepts `window.cornerRadius`, the corner radius of a client-decorated window on Linux where the desktop's cannot be measured.
- `desktop.json` accepts `window.windowControlsPosition` (`"left"` or `"right"`), the side the window controls use on Linux when the desktop gives none.
- `desktop.json` accepts `accessory`.
- `desktop.json` accepts `window.titleBar: "none"`.
- `desktop.json` accepts `window.windowButtons` and `window.shadow`.
- `desktop.json` accepts `window.background`: `opaque`, `transparent`, `blurred` or `mica`.
- `init` keeps React Native's own `App.tsx` and its new app screen instead of replacing it.
- `init` and `init-desktop` add `@react-native-gpui/safe-area-context` to an app that uses `react-native-safe-area-context`, and pin that library to the version the module supports.
- `run-desktop` downloads the prebuilt runtime before building, so its progress shows in the terminal instead of Cargo looking stuck.
- `init` and `init-desktop` add a `desktop` script to `package.json`, so `npm run desktop` starts the app.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- `init` creates an app with a `desktop/` target; `init-desktop` adds one to an existing React Native app.
- `run-desktop` builds and runs the app, in debug against Metro or with `--release`.
- `package-desktop` builds `.app` and `.dmg` on macOS, an NSIS installer on Windows, and `.deb` and `.AppImage` on Linux.
- `doctor` checks the toolchain on each operating system.
- Autolinks desktop modules from their `react-native.config.js`, and prunes stale build output after a day.
