# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui):
one GPU-accelerated Rust renderer for **macOS, Windows and Linux**.

- An out-of-tree React Native platform, like react-native-windows, built on `react-native@0.87.1`.
- Fabric (C++) lays out with Yoga; GPUI paints and owns the event loop.
- `Platform.OS` is `'gpui'`; `Platform.hostOS` is `'macos'`, `'windows'` or `'linux'`.

## Requirements

- Node.js 22.13 or newer
- Rust (stable) with cargo
- CMake and Ninja
- A C++20 compiler: Xcode command line tools on macOS, Visual Studio 2022
  Build Tools (MSVC) on Windows, GCC or Clang on Linux

## Create an app

```sh
npx @react-native-gpui/cli init MyApp
cd MyApp
npm install
npx react-native run-desktop
```

This creates a standard React Native project with `ios/` and `android/`, plus a
`desktop/` GPUI target. All three use the same app entry and dependencies, so
`npx react-native run-ios` and `npx react-native run-android` work as usual.

To add GPUI to an existing React Native project, run `npx react-native init-desktop`.

## Native modules

Create a TurboModule package in Rust or C++:

```sh
npx react-native create-library mmkv              # Rust
npx react-native create-library mmkv --type cpp   # C++
```

Both templates use React Native's `TurboModuleRegistry` API and TypeScript specs.

### Fabric components

A native package that provides Fabric components declares their descriptors
and headers in the GPUI entry of its `react-native.config.js`:

```js
gpui: {
  cmake: 'gpui',
  componentDescriptors: ['RNCSafeAreaViewComponentDescriptor'],
  componentHeaders: [
    'react/renderer/components/safeareacontext/ComponentDescriptors.h',
  ],
}
```

Autolinking registers the descriptors with Fabric and runs React Native Codegen
for dependencies whose `codegenConfig.type` is `components` or `all`.
Handwritten sources and include directories go in `componentSources` and
`componentIncludeDirs`. Missing or duplicate descriptors are reported during
autolinking or at startup.

## Supported libraries

| Package                                | Adds GPUI support for            |
| -------------------------------------- | -------------------------------- |
| `@react-native-gpui/reanimated`        | `react-native-reanimated` 4      |
| `@react-native-gpui/worklets`          | `react-native-worklets`          |
| `@react-native-gpui/gesture-handler`   | `react-native-gesture-handler`   |
| `@react-native-gpui/screens`           | `react-native-screens`           |
| `@react-native-gpui/safe-area-context` | `react-native-safe-area-context` |
| `@react-native-gpui/svg`               | `react-native-svg`               |
| `@react-native-gpui/fonts`             | Custom font loading              |
| `@react-native-gpui/testing`           | Desktop test presets and driver  |

## Prebuilt C++ runtime

Most of a clean build is spent compiling the React Native C++ runtime and its
native dependencies. When a prebuilt runtime is published for your platform, the
build downloads it once, verifies it and caches it. Otherwise it builds the
runtime from source.

Environment variables:

| Variable                                                | Effect                                           |
| ------------------------------------------------------- | ------------------------------------------------ |
| `RN_GPUI_BUILD_FROM_SOURCE=1`                           | Always build the runtime from source             |
| `RN_GPUI_REQUIRE_PREBUILT=1`                            | Fail instead of falling back to a source build   |
| `RN_GPUI_PREBUILT_DIR=<dir>`                            | Use an already unpacked runtime; no download     |
| `RN_GPUI_PREBUILT_CACHE=<dir>`                          | Cache location (default: the OS cache directory) |
| `RN_GPUI_PREBUILT_OFFLINE=1` / `CARGO_NET_OFFLINE=true` | Use the cache only                               |

## License

[MIT](LICENSE)
