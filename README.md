# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) —
one GPU-accelerated Rust renderer for **macOS, Windows and Linux**.

- Out-of-tree platform package (react-native-windows model) pinned to `react-native@0.87.1`
- Rust owns the process entry; GPUI owns the main thread and event loop
- Fabric (C++) does layout via Yoga; a custom `gpui::Element` paints via GPUI
- `Platform.OS === 'gpui'`, `Platform.hostOS` is `'macos' | 'windows' | 'linux'`

See `.local/react-native-gpui.md` for the full design doc.

## Toolchain (verified on the dev machine, TODO 0.4)

| Tool | Version |
|---|---|
| macOS | Darwin (Apple) |
| Node.js | v22.20.0 |
| npm | (bundled) |
| Rust / cargo | 1.96.0 |
| CMake | 3.31.4 |
| Ninja | 1.12.1 |
| clang | Apple clang 21.0.0 |

## Status

Phase 0–1 in progress: C++ core (ReactCommon + vendored ReactCxxPlatform + Hermes)
building into a Cargo workspace, then the GPUI window + mount pipeline.

## Build

```sh
npm install
# TODO 1.3+: cargo build from packages/react-native-gpui/ReactGpui
```
