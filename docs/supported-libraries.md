---
id: supported-libraries
title: Supported libraries
---

These libraries work on desktop with their own JavaScript API unchanged. Install the original library, and the desktop package next to it; autolinking builds the native side.

| Library                          | Desktop package                        | Targets                                                |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `react-native-safe-area-context` | `@react-native-gpui/safe-area-context` | `5.10.x`                                               |
| `react-native-gesture-handler`   | `@react-native-gpui/gesture-handler`   | `3.3.x`, with Reanimated `4.7.x` and Worklets `0.13.x` |
| `react-native-screens`           | `@react-native-gpui/screens`           | `4.28.x`                                               |
| `react-native-reanimated`        | `@react-native-gpui/reanimated`        | `4.7.x`, with Worklets `0.13.x`                        |
| `react-native-worklets`          | `@react-native-gpui/worklets`          | `0.13.x`                                               |
| `react-native-svg`               | `@react-native-gpui/svg`               | `15.15.x`                                              |
| `@react-native-vector-icons/*`   | `@react-native-gpui/vector-icons`      | Icon fonts rasterized by the desktop shell             |

Two packages have no upstream library, because they provide desktop APIs:

| Package                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `@react-native-gpui/fs`    | [A Node-shaped file system API](desktop-file-system). |
| `@react-native-gpui/fonts` | [Custom font loading](desktop-fonts).                 |

More libraries and desktop modules (clipboard, keychain with secure storage, netinfo, webview, device info, PDF viewer, notifications, system, updater, spell checking, WebAuthn, image manipulation and others) live in [react-native-gpui-modules](https://github.com/streetwriters/react-native-gpui-modules), each with its own README and documentation.

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

Other libraries work when they are pure JavaScript. A library with native code needs a desktop implementation. See [Port an existing library](porting-libraries), or [write a native module](turbo-native-modules). Where the code only needs gating, check `Platform.OS` at run time, and do not import native-only libraries on desktop.
