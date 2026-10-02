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

## Create an app

```sh
npx @react-native-gpui/cli init MyApp
cd MyApp
npm install
npx react-native run-desktop
```

The initializer creates a standard React Native project with `ios/` and
`android/` directories, then adds a `desktop/` GPUI target. All three platforms
use the same React Native app entry and dependencies. Use `npx react-native run-ios` and `npx react-native run-android` for the standard mobile workflows.

GPUI builds its own Hermes VM with Node-API enabled; see [the Hermes build
notes](docs/hermes.md) for the external source checkout setup.

To add GPUI support to an existing React Native project, run
`npx react-native init-desktop`. Create a native TurboModule package with
`npx react-native create-library mmkv` (Rust) or
`npx react-native create-library mmkv --type cpp` (C++). Both templates use
React Native's `TurboModuleRegistry` API and TypeScript specs.
