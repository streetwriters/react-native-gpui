# Changelog

All notable changes to `@react-native-gpui/cli` are listed here. Each version's section becomes the notes of its GitHub release.

## 0.87.0-alpha.0 - 2026-11-01

- First release.
- `init` creates an app with a `desktop/` target; `init-desktop` adds one to an existing React Native app.
- `run-desktop` builds and runs the app, in debug against Metro or with `--release`.
- `package-desktop` builds `.app` and `.dmg` on macOS, an NSIS installer on Windows, and `.deb` and `.AppImage` on Linux.
- `doctor` checks the toolchain on each operating system.
- Autolinks desktop modules from their `react-native.config.js`, and prunes stale build output after a day.
