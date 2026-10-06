# React Native GPUI

React Native for the desktop, rendered with [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) —
one GPU-accelerated Rust renderer for **macOS, Windows and Linux**.

- Out-of-tree platform package (react-native-windows model) pinned to `react-native@0.87.1`
- Rust owns the process entry; GPUI owns the main thread and event loop
- Fabric (C++) does layout via Yoga; a custom `gpui::Element` paints via GPUI
- `Platform.OS === 'gpui'`, `Platform.hostOS` is `'macos' | 'windows' | 'linux'`

See `.local/react-native-gpui.md` for the full design doc.

## Toolchain (verified on the dev machine, TODO 0.4)

| Tool         | Version            |
| ------------ | ------------------ |
| macOS        | Darwin (Apple)     |
| Node.js      | v22.20.0           |
| npm          | (bundled)          |
| Rust / cargo | 1.96.0             |
| CMake        | 3.31.4             |
| Ninja        | 1.12.1             |
| clang        | Apple clang 21.0.0 |

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

GPUI runs its own Hermes build, pinned to one `facebook/hermes` commit and
shipped as the `@react-native-gpui/hermes` workspace package: the headers are
committed there, and the VM and `hermesc` binaries are built for every platform
by the `hermes-engine` workflow. Install them with
`npm run fetch-binaries --workspace @react-native-gpui/hermes`.

To add GPUI support to an existing React Native project, run
`npx react-native init-desktop`. Create a native TurboModule package with
`npx react-native create-library mmkv` (Rust) or
`npx react-native create-library mmkv --type cpp` (C++). Both templates use
React Native's `TurboModuleRegistry` API and TypeScript specs.

## Fabric components in native packages

A native package that provides Fabric components declares their descriptors
and headers in its `react-native.config.js` GPUI platform entry:

```js
gpui: {
  cmake: 'gpui',
  componentDescriptors: ['RNCSafeAreaViewComponentDescriptor'],
  componentHeaders: [
    'react/renderer/components/safeareacontext/ComponentDescriptors.h',
  ],
}
```

Autolinking registers these descriptors with Fabric and runs React Native
Codegen for dependencies whose `codegenConfig.type` is `components` or `all`.
Their generated C++ is kept under `desktop/autolink/codegen/` and compiled into
the app. Handwritten platform sources and include directories can be added as
`componentSources` and `componentIncludeDirs` in the same GPUI config. Missing
or duplicate descriptors are reported during autolinking or app startup.
