---
id: desktop-json
title: desktop.json
---

`desktop/desktop.json` describes the app: its name, icon, main window, tray and how it is packaged. Every field is optional, so an app without the file runs and packages with the defaults.

```json title="desktop/desktop.json"
{
  "$schema": "../node_modules/@react-native-gpui/cli/desktop.schema.json",
  "productName": "My App",
  "identifier": "com.example.myapp",
  "icon": "assets/icon.png",
  "window": { "title": "My App", "width": 1024, "height": 768 },
  "bundle": { "targets": "all", "category": "DeveloperTool" }
}
```

The `$schema` line gives your editor completion and validation.

## Per-OS overrides

`desktop.macos.json`, `desktop.windows.json` and `desktop.linux.json` are merged over `desktop.json` on that operating system, following [JSON Merge Patch (RFC 7386)](https://www.rfc-editor.org/rfc/rfc7386). Objects merge key by key, other values replace the base value, and `null` removes a key.

```json title="desktop/desktop.windows.json"
{
  "window": { "titleBar": "hidden" }
}
```

## App

| Key              | Type       | Description                                                                                                                                                     |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productName`    | `string`   | The name people see: the title bar, the Dock, the menu bar and installers. Defaults to the app's `displayName`, then its `name`.                                |
| `identifier`     | `string`   | The reverse-DNS bundle id, such as `com.example.myapp`. Defaults to an id derived from the app name.                                                            |
| `version`        | `string`   | The app version. Defaults to the version in `package.json`.                                                                                                     |
| `icon`           | `string`   | One square PNG, recommended 1024×1024, relative to `desktop/`. The icon of each operating system is generated from it. Without one, a placeholder icon is used. |
| `urlSchemes`     | `string[]` | URL schemes that open the app, such as `["myapp"]`. Packaging registers them with the operating system, and [`Linking`](linking) delivers the URL.              |
| `singleInstance` | `boolean`  | Whether opening the app again hands its URL to the running copy and exits. Defaults to `true` when `urlSchemes` is set.                                         |
| `devMenu`        | `boolean`  | Whether the [development menu](debugging) is available. Defaults to `true` in development builds.                                                               |

## window

The main window.

| Key                    | Type                                               | Description                                                                                                                   |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `title`                | `string`                                           | The title bar text. Defaults to `productName`.                                                                                |
| `width`, `height`      | `number`                                           | The size in points. Defaults to 1024 × 768.                                                                                   |
| `position`             | `{x, y}`                                           | Where the window opens. Omit it to let the platform place the window.                                                         |
| `resizable`            | `boolean`                                          | Whether the window can be resized. Defaults to `true`.                                                                        |
| `restoreState`         | `boolean`                                          | Whether the window remembers its size and position between launches. Defaults to `true`.                                      |
| `titleBar`             | `'default' \| 'transparent' \| 'hidden'`           | How the title bar is drawn. See [Title bar](desktop-title-bar). Defaults to `'default'`.                                      |
| `background`           | `'opaque' \| 'transparent' \| 'blurred' \| 'mica'` | What shows through the window. See [Transparent windows](desktop-windows#transparent-windows). Defaults to `'opaque'`.        |
| `trafficLightPosition` | `{x, y}`                                           | Where the macOS traffic lights sit in a transparent or hidden title bar. Ignored elsewhere.                                   |
| `menuBar`              | `boolean`                                          | Whether the main window shows a menu bar. Windows and Linux only; on macOS the bar belongs to the system. Defaults to `true`. |

## tray

A menu-bar or notification-area icon. See [Tray](desktop-tray).

| Key            | Type      | Description                                                                        |
| -------------- | --------- | ---------------------------------------------------------------------------------- |
| `component`    | `string`  | The React component rendered as the tray popover.                                  |
| `tooltip`      | `string`  | The tooltip text.                                                                  |
| `icon`         | `string`  | A PNG or JPEG path relative to `desktop/`. Without one, a built-in glyph is shown. |
| `iconTemplate` | `boolean` | macOS: draw the icon as a template the menu bar tints. Defaults to `false`.        |
| `accessory`    | `boolean` | Run the app without a Dock icon. Defaults to `true`.                               |

## bundle

How the app is packaged by [`package-desktop`](publishing-desktop).

| Key         | Type                  | Description                                                                                                         |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `targets`   | `'all'` or `string[]` | The formats to build: `app`, `dmg`, `nsis`, `deb`, `appimage`. `'all'` means every format the current OS can build. |
| `resources` | `string[]`            | Extra files to ship, relative to `desktop/`.                                                                        |
| `copyright` | `string`              | The copyright line shown by installers.                                                                             |
| `category`  | `string`              | The app category, for the Linux desktop entry.                                                                      |

### bundle.macos

| Key                    | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `minimumSystemVersion` | The oldest macOS the app supports. Defaults to `13.0`.   |
| `entitlements`         | A path to an entitlements plist, relative to `desktop/`. |
| `infoPlist`            | Extra keys merged into the generated `Info.plist`.       |

### bundle.windows

| Key                | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| `nsis.installMode` | `currentUser`, `perMachine` or `both`: who the installer installs the app for. |

### bundle.linux

| Key           | Description                               |
| ------------- | ----------------------------------------- |
| `deb.depends` | Extra Debian package dependencies.        |
| `appimage`    | AppImage options. None are available yet. |
