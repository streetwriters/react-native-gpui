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

## JavaScript engine

React Native GPUI has no built-in JS engine. An engine is an ordinary installed
package that autolinks like any other native library, so installing one is how
you opt in. `@react-native-gpui/hermes` is the default in new apps; a QuickJS,
JavaScriptCore or V8 package registers the same way without changes to core.

### Choosing an engine

| Where                                                            | Effect                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `RN_GPUI_JS_ENGINE=<name>`                                       | Run this engine for one launch; overrides the app's choice |
| `DesktopAppConfig::js_engine("<name>")` in `desktop/src/main.rs` | The app's choice                                           |
| the installed set                                                | With one engine installed it is the default                |

With several engines installed and none chosen, startup fails with a message
listing them. There is no `app.json` key for this.

```ts
import { Platform } from 'react-native';

console.log(Platform.constants.jsEngine); // {name: 'hermes', version: '10a40b5…'}
```

`name` is the engine package's `jsEngine.name`; `version` is whatever the engine
reports (Hermes reports the pinned `facebook/hermes` commit).

### Writing an engine package

The contract is `ReactGpui/rn-gpui-sys/cpp/GpuiJsEngine.h` in
`react-native-gpui`. An engine package declares itself in its
`react-native.config.js` GPUI entry:

```js
gpui: {
  cmake: 'gpui',
  jsEngine: {
    name: 'hermes',
    register: 'rn_gpui_register_js_engine_hermes', // C symbol, called at startup
    bundle: './gpui/bundle.js',                   // optional JS tooling hooks
    runtimeFiles: './gpui/runtime-files.js',      // optional shared libraries to ship
  },
}
```

Its `gpui/CMakeLists.txt` adds whatever the engine needs and tells core about it
through global properties: `RN_GPUI_JS_ENGINE_SUBDIRECTORIES`,
`RN_GPUI_JS_ENGINE_SOURCES`, `RN_GPUI_JS_ENGINE_INCLUDE_DIRS`,
`RN_GPUI_JS_ENGINE_DEFINITIONS`, `RN_GPUI_JS_ENGINE_DEPS` and
`RN_GPUI_JS_ENGINE_NODE_API_SOURCES`.

The registration function calls `rngpui::registerJsEngine` with the engine's
info, a required `makeRuntimeFactory`, and optionally a Node-API host module and
feature-flag overrides. `@react-native-gpui/hermes/gpui` is a worked example.

`bundle.js` may export any of:

- `metroConfig(config)` — Metro changes the engine needs, e.g. Hermes'
  `transformer.unstable_transformProfile = 'hermes-stable'`.
- `compile({input, output, sourcemapInput, sourcemapOutput, dev})` — turn a
  bundle into the engine's shipping format (`hermesc -emit-binary` for Hermes).
  Without it, release builds ship the plain JS bundle.
- `bundleExtension` — the file name the runtime loads, e.g. `'.hbc'`.

A prebuilt runtime does not yet compile an engine's glue per app; use a source
build until that lands.

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
| `@react-native-gpui/hermes`            | The Hermes JS engine             |
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
