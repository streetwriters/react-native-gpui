---
id: supported-libraries
title: Supported libraries
---

These libraries work on desktop with their own JavaScript API unchanged. Install the original library, and the desktop package next to it; autolinking builds the native side.

| Library                                     | Desktop package                          | Targets                                                        |
| ------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `react-native-safe-area-context`            | `@react-native-gpui/safe-area-context`   | `5.10.x`                                                       |
| `react-native-gesture-handler`              | `@react-native-gpui/gesture-handler`     | `3.3.x`, with Reanimated `4.7.x` and Worklets `0.13.x`         |
| `react-native-screens`                      | `@react-native-gpui/screens`             | `4.28.x`                                                       |
| `react-native-reanimated`                   | `@react-native-gpui/reanimated`          | `4.7.x`, with Worklets `0.13.x`                                |
| `react-native-worklets`                     | `@react-native-gpui/worklets`            | `0.13.x`                                                       |
| `react-native-svg`                          | `@react-native-gpui/svg`                 | `15.15.x`                                                      |
| `@react-native-vector-icons/*`              | `@react-native-gpui/vector-icons`        | Icon fonts rasterized by the desktop shell                     |
| `react-native-nitro-modules`                | `@react-native-gpui/nitro-modules`       | `0.37.x`, Nitro Modules and Nitro Views written in C++         |
| `react-native-unistyles`                    | `@react-native-gpui/unistyles`           | `3.8.x`, needs the Nitro adapter above                         |
| `react-native-mmkv`                         | `@react-native-gpui/mmkv`                | `4.3.x`, needs the Nitro adapter above                         |
| `@react-native-async-storage/async-storage` | `@react-native-gpui/async-storage`       | `3.1.x`                                                        |
| `@react-native-masked-view/masked-view`     | `@react-native-gpui/masked-view`         | `0.3.x`                                                        |
| `react-native-keyboard-controller`          | `@react-native-gpui/keyboard-controller` | `1.23.x`; no soft keyboard, so the keyboard height is always 0 |
| `@react-native-community/slider`            | `@react-native-gpui/slider`              | `5.2.x`                                                        |
| `@react-native-picker/picker`               | `@react-native-gpui/picker`              | `2.11.x`, a dropdown that opens a context menu                 |
| `react-native-linear-gradient`              | `@react-native-gpui/linear-gradient`     | `2.8.x`                                                        |
| `react-native-localize`                     | `@react-native-gpui/localize`            | `3.7.x`                                                        |
| `react-native-haptic-feedback`              | `@react-native-gpui/haptic-feedback`     | `3.0.x`; trackpad haptics on macOS, no-ops elsewhere           |
| `react-native-config`                       | `@react-native-gpui/config`              | `1.7.x`                                                        |
| `@react-native-clipboard/clipboard`         | `@react-native-gpui/clipboard`           | `1.16.x`                                                       |
| `@react-native-community/netinfo`           | `@react-native-gpui/netinfo`             | `11.4.x`                                                       |
| `react-native-device-info`                  | `@react-native-gpui/device-info`         | `14.1.x`                                                       |
| `@react-native-documents/picker`            | `@react-native-gpui/documents-picker`    | `11.0.x`                                                       |
| `react-native-keychain`                     | `@react-native-gpui/keychain`            | `11.0.x`                                                       |
| `react-native-webview`                      | `@react-native-gpui/webview`             | `13.16.x`                                                      |
| GPUI Kit (`gpui-component`)                 | `@react-native-gpui/gpui-kit`            | `0.0.1-alpha.1`, the kit's components as React components      |

## Libraries with desktop support built in

These libraries ship their desktop implementation themselves, so there is no separate desktop package: install the library, and autolinking builds it.

| Library                                | Version                   | What it does                                                                                             |
| -------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@ammarahmed/react-native-workers`     | `1.0.0-alpha.5` and later | Runs JavaScript in worker threads, each with its own runtime                                             |
| `react-native-mmkv-storage`            | `13.1.0` and later        | MMKV key-value storage with encryption and multiple instances. The Windows build needs the next release. |
| `@ammarahmed/react-native-sodium`      | `2.0.0-alpha.3` and later | libsodium cryptography                                                                                   |
| `@ammarahmed/react-native-upload`      | `7.0.0-alpha.2` and later | File uploads over HTTP                                                                                   |
| `@ammarahmed/react-native-eventsource` | `1.2.0` and later         | Server-Sent Events (`EventSource`)                                                                       |
| `react-native-gzip`                    | `1.2.1` and later         | gzip compression and decompression of strings                                                            |

The desktop packages, and the desktop-only modules that have no upstream library (`crypto`, `fonts`, `fs`, `image-manipulator`, `notifications`, `openpgp`, `pdf`, `spellcheck`, `system`, `updater` and `webauthn`, all under `@react-native-gpui/`), live in [react-native-gpui-modules](https://github.com/streetwriters/react-native-gpui-modules), each with its own README and documentation.

## Installing

Install the library and its desktop package, with the versions listed above:

```shell
npm install react-native-svg @react-native-gpui/svg
```

The desktop package lists the upstream library as a peer dependency with the series it supports, so a mismatch is reported when you install.

Reanimated and Gesture Handler depend on Worklets, so install `react-native-worklets` and `@react-native-gpui/worklets` with them.

Install the regular npm releases of Reanimated and Worklets. Their C++ sources need small fixes to compile with MSVC and on Linux, so `@react-native-gpui/reanimated` and `@react-native-gpui/worklets` apply those fixes to a copy in the desktop build directory. The files in `node_modules` are not changed. If the installed version is one the fixes don't apply to, the build stops and names the file.

## Navigation

React Navigation and Expo Router are JavaScript on top of Screens and Gesture Handler, so there is nothing to port. They work once those libraries are installed. For apps that use a stack, `useDesktopForwardNavigation` from `@react-native-gpui/core/navigation` makes the mouse's forward button move forward in a React Navigation stack, and the back button already fires `BackHandler`.

## A library that is not listed

Other libraries work when they are pure JavaScript; `react-native-calendars`, for example, runs unchanged. A library with native code needs a desktop implementation. See [Port an existing library](porting-libraries), or [write a native module](turbo-native-modules). Where the code only needs gating, check `Platform.OS` at run time, and do not import native-only libraries on desktop.
