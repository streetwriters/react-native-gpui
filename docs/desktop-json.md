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

## What applies on every build

`npx react-native run-desktop` records `desktop.json` in the build, and the app's window options reach the running app on every rebuild. You do not have to run `init-desktop` again or edit `desktop/src/main.rs`.

These keys apply: `window.title`, `width`, `height`, `position`, `resizable`, `restoreState`, `titleBar`, `background`, `windowButtons`, `shadow`, `trafficLightPosition`, `cornerRadius`, `windowControlsPosition` and `menuBar`, plus `accessory`.

A call on the config in `main.rs` after `DesktopAppConfig::from_env_with_defaults(...)`, such as `.title_bar(...)` or `.window_size(...)`, replaces the value from `desktop.json`. `RN_GPUI_WIDTH` and `RN_GPUI_HEIGHT` still win over the size. The other keys (`productName`, `identifier`, `icon`, `urlSchemes`, `singleInstance`, `devMenu`, `tray`, `bundle`) take effect through packaging, or through the `main.rs` that `init-desktop` writes.

A build that skips the CLI, such as plain `cargo build`, uses the options from the last CLI run.

## Per-OS overrides

`desktop.macos.json`, `desktop.windows.json` and `desktop.linux.json` are merged over `desktop.json` on that operating system, following [JSON Merge Patch (RFC 7386)](https://www.rfc-editor.org/rfc/rfc7386). Objects merge key by key, other values replace the base value, and `null` removes a key.

```json title="desktop/desktop.windows.json"
{
  "window": { "titleBar": "hidden" }
}
```

## App

### `productName`

The name people see: the title bar, the Dock, the menu bar and installers. Defaults to the app's `displayName`, then its `name`.

| Type     |
| -------- |
| `string` |

---

### `identifier`

The reverse-DNS bundle id, such as `com.example.myapp`. Defaults to an id derived from the app name.

| Type     |
| -------- |
| `string` |

---

### `version`

The app version. Defaults to the version in `package.json`.

| Type     |
| -------- |
| `string` |

---

### `icon`

One square PNG, recommended 1024×1024, relative to `desktop/`. The icon of each operating system is generated from it. Without one, a placeholder icon is used.

| Type     |
| -------- |
| `string` |

---

### `urlSchemes`

URL schemes that open the app, such as `["myapp"]`. Packaging registers them with the operating system, and [`Linking`](linking) delivers the URL.

| Type       |
| ---------- |
| `string[]` |

---

### `singleInstance`

Whether opening the app again hands its URL to the running copy and exits. Defaults to `true` when `urlSchemes` is set.

| Type      |
| --------- |
| `boolean` |

---

### `devMenu`

Whether the [development menu](debugging) is available. Defaults to `true` in development builds.

| Type      |
| --------- |
| `boolean` |

---

### `accessory`

Whether the app runs with no Dock icon (macOS), as a launcher does. Only an accessory app's windows can show over another app's full-screen Space. Defaults to `false`.

| Type      |
| --------- |
| `boolean` |

## window

The main window.

### `title`

The title bar text. Defaults to `productName`.

| Type     |
| -------- |
| `string` |

---

### `width`, `height`

The size in points. Defaults to 1024 × 768.

| Type     |
| -------- |
| `number` |

---

### `position`

Where the window opens. Omit it to let the platform place the window.

| Type     |
| -------- |
| `{x, y}` |

---

### `resizable`

Whether the window can be resized. Defaults to `true`.

| Type      |
| --------- |
| `boolean` |

---

### `restoreState`

Whether the window remembers its size and position between launches. Defaults to `true`.

| Type      |
| --------- |
| `boolean` |

---

### `titleBar`

How the title bar is drawn. See [Title bar](desktop-title-bar). Defaults to `'default'`.

| Type       |
| ---------- |
| `'default' | 'transparent' | 'hidden'` |

---

### `background`

What shows through the window. See [Transparent windows](desktop-windows#transparent-windows). Defaults to `'opaque'`.

| Type      |
| --------- |
| `'opaque' | 'transparent' | 'blurred' | 'mica'` |

---

### `windowButtons`

Whether macOS draws the traffic lights. Defaults to `true`; other systems ignore it.

| Type      |
| --------- |
| `boolean` |

---

### `shadow`

Whether the window has the system shadow. Defaults to `true`. On Linux it is the shadow a client-decorated window draws around itself.

| Type      |
| --------- |
| `boolean` |

---

### `trafficLightPosition`

Where the macOS traffic lights sit in a transparent or hidden title bar. Ignored elsewhere.

| Type     |
| -------- |
| `{x, y}` |

---

### `cornerRadius`

The corner radius, in points, of a client-decorated window on Linux when the desktop's own cannot be measured. Ignored on Windows and macOS.

| Type     |
| -------- |
| `number` |

---

### `windowControlsPosition`

The side of the title bar the window controls (minimize, maximize, close) use on Linux when the desktop does not say where its own go. Defaults to `'right'`. Ignored on Windows and macOS.

| Type    |
| ------- |
| `'left' | 'right'` |

---

### `menuBar`

Whether the main window shows a menu bar. Windows and Linux only; on macOS the bar belongs to the system. Defaults to `true`.

| Type      |
| --------- |
| `boolean` |

## tray

A menu-bar or notification-area icon. See [Tray](desktop-tray).

### `component`

The React component rendered as the tray popover.

| Type     |
| -------- |
| `string` |

---

### `tooltip`

The tooltip text.

| Type     |
| -------- |
| `string` |

---

### `icon`

A PNG or JPEG path relative to `desktop/`. Without one, a built-in glyph is shown.

| Type     |
| -------- |
| `string` |

---

### `iconTemplate`

macOS: draw the icon as a template the menu bar tints. Defaults to `false`.

| Type      |
| --------- |
| `boolean` |

---

### `accessory`

Run the app without a Dock icon. Defaults to `true`.

| Type      |
| --------- |
| `boolean` |

---

### `popoverAnchor`

Linux on Wayland: the corner of the screen's work area the popover is drawn in. `'auto'` puts it at the end of the panel's edge, or centred on the click when the panel reports one. Ignored where the popover opens at the icon. See [Popover position on Linux](desktop-tray#popover-position-on-linux).

| Type                                                                                 | Default  |
| ------------------------------------------------------------------------------------ | -------- |
| `'auto' \| 'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right' \| 'center'` | `'auto'` |

---

### `popoverOffset`

Linux on Wayland: moves the popover from its corner, in points.

| Type     |
| -------- |
| `{x, y}` |

## bundle

How the app is packaged by [`package-desktop`](publishing-desktop).

### `targets`

The formats to build: `app`, `dmg`, `nsis`, `deb`, `appimage`. `'all'` means every format the current OS can build.

| Type                  |
| --------------------- |
| `'all'` or `string[]` |

---

### `resources`

Extra files to ship, relative to `desktop/`.

| Type       |
| ---------- |
| `string[]` |

---

### `copyright`

The copyright line shown by installers.

| Type     |
| -------- |
| `string` |

---

### `category`

The app category, for the Linux desktop entry.

| Type     |
| -------- |
| `string` |

### bundle.macos

#### `minimumSystemVersion`

The oldest macOS the app supports. Defaults to `13.0`.

---

#### `entitlements`

A path to an entitlements plist, relative to `desktop/`.

---

#### `infoPlist`

Extra keys merged into the generated `Info.plist`.

### bundle.windows

#### `nsis.installMode`

`currentUser`, `perMachine` or `both`: who the installer installs the app for.

### bundle.linux

#### `deb.depends`

Extra Debian package dependencies.

---

#### `appimage`

AppImage options. None are available yet.
