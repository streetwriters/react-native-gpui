---
id: desktop
title: Desktop
---

Tells your code which platform it runs on and what the desktop shell can do there, so a feature can be shown only where it works. Everything is imported from `@react-native-gpui/core/desktop`.

## Example

```tsx
import {
  Desktop,
  capabilities,
  isDesktopAvailable,
} from '@react-native-gpui/core/desktop';

const { platform, arch } = await Desktop.getInfo();

if (capabilities().menuBarInWindow) {
  return <HideMenuBarToggle />;
}
```

---

# Reference

## Methods

### `Desktop.getInfo()`

```tsx
Desktop.getInfo(): Promise<DesktopAppInfo>;
```

Resolves with the platform, the CPU architecture and the capabilities.

---

### `capabilities()`

```tsx
function capabilities(): DesktopCapabilities;
```

Reads the [capabilities](#capabilities) synchronously, without touching the main thread. Without a desktop shell every capability is `false`.

---

### `platform()`

```tsx
function platform(): string | null;
```

The host platform synchronously: `macos`, `windows` or `linux`, and `null` in an app that has no desktop shell. It is the same value as `Platform.OS`.

---

### `useClientDecorations()`

```tsx
function useClientDecorations(): boolean;
```

Whether the window is frameless, so the app draws its own caption buttons. It follows the compositor: on Linux the answer can change after the window opens, and the component re-renders when it does.

---

## Properties

### `isDesktopAvailable`

`true` when the desktop shell is installed. Code shared with an Android or iOS app can check it before calling the desktop modules.

---

## Capabilities

The fields `capabilities()` returns.

### `nativeAppMenu`

The application menu is the platform's own.

---

### `nativeContextMenu`

The platform can show its own context menu.

---

### `tray`

Tray icons are supported.

---

### `trayPopoverAnchored`

A tray popover is anchored to the icon. On Wayland it is drawn at the panel's edge instead; see [Popover position on Linux](desktop-tray#popover-position-on-linux).

---

### `windowPosition`

Windows can be positioned from code. Wayland places windows itself.

---

### `alwaysOnTop`

A window can stay above others.

---

### `visibleOnAllWorkspaces`

A window can be shown on every Space or workspace. macOS only for now; elsewhere the option is ignored.

---

### `transparentTitlebar`

A window can draw under its title bar.

---

### `clientDecorations`

A frameless window can still be resized, so you can draw your own caption buttons. Always true on macOS and Windows; on Linux it follows what the compositor granted. The first call waits until the window has reported it, so the answer is right when your first component renders.

---

### `menuBarInWindow`

The menu bar is drawn in the window, so hiding it has an effect.

---

## DesktopError

The desktop modules reject with a `DesktopError`. Its `code` is one of:

### `unsupported`

The operating system, or this app, cannot perform the operation.

---

### `invalid_argument`

An argument was not valid.

---

### `not_found`

The window or item does not exist.

---

### `reloaded`

The JavaScript bundle reloaded before the call finished.

---

### `failed`

The operation failed for another reason. See the message.
