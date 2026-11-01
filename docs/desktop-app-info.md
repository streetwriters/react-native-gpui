---
id: desktop-app-info
title: App info and capabilities
---

The `Desktop` object tells your code which platform it runs on and what the shell can do there, so you can show a feature only where it works.

```tsx
import {
  Desktop,
  capabilities,
  isDesktopAvailable,
} from '@react-native-gpui/core/desktop';
```

## Reading app info

`Desktop.getInfo()` resolves with the platform, the CPU architecture and the capabilities:

```ts
const { platform, arch, capabilities } = await Desktop.getInfo();
```

`platform()` returns the host platform synchronously (`macos`, `windows` or `linux`), and `null` in an app that has no desktop shell. It is the same value as `Platform.OS`.

## Capabilities

`capabilities()` reads the capabilities synchronously and never touches the main thread. Without a desktop shell every capability is `false`.

| Capability            | Meaning                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nativeAppMenu`       | The application menu is the platform's own.                                                                                                                           |
| `nativeContextMenu`   | The platform can show its own context menu.                                                                                                                           |
| `tray`                | Tray icons are supported.                                                                                                                                             |
| `trayPopoverAnchored` | A tray popover is anchored to the icon.                                                                                                                               |
| `windowPosition`      | Windows can be positioned from code.                                                                                                                                  |
| `alwaysOnTop`         | A window can stay above others.                                                                                                                                       |
| `transparentTitlebar` | A window can draw under its title bar.                                                                                                                                |
| `clientDecorations`   | A frameless window can still be resized, so you can draw your own caption buttons. Always true on macOS and Windows; on Linux it follows what the compositor granted. |
| `menuBarInWindow`     | The menu bar is drawn in the window, so hiding it has an effect.                                                                                                      |

```tsx
if (capabilities().menuBarInWindow) {
  return <HideMenuBarToggle />;
}
```

## Detecting the shell

`isDesktopAvailable` is `true` when the desktop shell is installed. Code shared with an Android or iOS app can check it before calling the desktop modules.

## Errors

The desktop modules reject with a `DesktopError`. Its `code` is one of:

| Code               | Meaning                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `unsupported`      | The operating system, or this app, cannot perform the operation. |
| `invalid_argument` | An argument was not valid.                                       |
| `not_found`        | The window or item does not exist.                               |
| `reloaded`         | The JavaScript bundle reloaded before the call finished.         |
| `failed`           | The operation failed for another reason. See the message.        |
