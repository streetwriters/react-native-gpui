---
id: renderers
title: Renderers
---

A renderer turns what React produces into the views a window shows. React Native for desktop ships with two: **Fabric**, React Native's own renderer, and **[Loom](https://github.com/ammarahm-ed/Loom)**, an alternative renderer that replaces Fabric's shadow tree with a tree of its own. An app picks one in [`desktop/desktop.json`](desktop-json) and builds and runs with that choice. Fabric is the default.

```json title="desktop/desktop.json"
{
  "renderer": "loom",
  "jsThread": "background"
}
```

| Key        | Values                               | Default        |
| ---------- | ------------------------------------ | -------------- |
| `renderer` | `"fabric"`, `"loom"`                 | `"fabric"`     |
| `jsThread` | `"background"`, `"main"` (Loom only) | `"background"` |

`RN_GPUI_RENDERER` and `RN_GPUI_JS_THREAD` override the file for one build, and `npx react-native run-desktop` takes `--renderer` and `--js-thread`:

```shell
npx react-native run-desktop --renderer loom --js-thread main
```

`jsThread` with Fabric is an error. A change of renderer rebuilds the native runtime and the JavaScript bundle. A change of `jsThread` rebuilds only the Rust part of the runtime: both modes share the C++ build, and the mode is fixed in the app when it is built, as Loom's iOS and Android builds fix it.

## What changes

The choice reaches every part of the build, so the JavaScript and the native code always agree:

- Metro resolves `react-native` and its subpaths to Loom's version of the package, so Loom's `View`, `Text`, lists and renderer bundle are the ones that run.
- The native runtime builds from source against Loom's headers and sources. There is no prebuilt runtime for Loom, so `RN_GPUI_BUILD_FROM_SOURCE` is implied and a first build takes as long as a source build of Fabric. The `prebuilt` option `always` cannot be combined with Loom.
- Autolinked modules compile against the same headers. A module needs no change to run on either renderer unless it reads Fabric's shadow tree directly; see below.

React Native's own files stay untouched. Loom is not on npm, so core pins it by commit (`ReactGpui/loom-pin.json`, the commit, the archive and its SHA-256) and downloads and verifies that archive into the shared per-user native-dependency cache on first use. It then runs Loom's own `materialize` against your installed `react-native` and keeps the result in the same cache. To work on Loom itself, set `RN_GPUI_LOOM_DIR` to a `react-native-loom` package directory and that is used instead of the download.

## JavaScript on the main thread

With `"jsThread": "background"`, JavaScript runs on its own thread, as it does with Fabric, and Loom's worker prepares commits off it. With `"main"`, JavaScript runs on the UI thread. A commit then applies without a thread hop, and React Native's timers and animation callbacks run in step with the frame. A long task in JavaScript blocks painting and input, which it cannot do in background mode. The setting is fixed when the app is built.

## Which modules work

Everything core renders works on both renderers: `View`, `Text`, `Image`, `ScrollView`, `TextInput`, `Modal` and the desktop components, and so do host components, native views and Rust or C++ TurboModules. A module that reads the shadow tree through `UIManager` or builds its own `ShadowNode` objects gets them from Loom's compatibility layer; one that calls Loom's own API (`<react/loom/Loom.h>`) is Loom-only.

## Limitations

- **Reanimated and worklets are not supported with Loom.** Loom's Reanimated adapter exists for iOS and Android only. Use `Animated`, which works on both renderers.
- Views that only position their children (no visual props) are flattened away by Loom, so they have no native node. Give a `View` `collapsable={false}`, or any prop it draws or reacts to, to keep one.
- `reportMount` is not called for Loom surfaces, so mount hooks that depend on the shadow tree do not see them.
- Only macOS is verified. The Windows and Linux builds take the same paths but have not been run.

## For platform maintainers

Core's own replacements for React Native files (`ReactCommonOverrides`, `ReactCxxPlatform`, `src-gpui`) are applied to either tree. Where Loom and core both replace a file, the Loom variant lives in `ReactCommonOverrides.loom` and wins in a Loom build; today that is `NativeDOM`. `overrides.json` records, for each of them, the hash of the file Loom ships (`loomBaseHash`), and `npm run check:loom-overrides` in `packages/core` fails when a new Loom pin changes one of those files.

Moving the pin follows the gpui-fast rule: change `loom-pin.json` (commit and SHA-256 of `https://codeload.github.com/ammarahm-ed/Loom/tar.gz/<commit>`), run the check, and carry any change Loom made to a shared file over to its variant.
