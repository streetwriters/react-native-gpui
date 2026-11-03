---
id: desktop-tray
title: Tray
---

A tray icon lives in the menu bar on macOS and in the notification area on Windows and Linux. It can open a menu, or a popover window that renders a React component, which makes it possible to build menu-bar apps.

```tsx
import { Tray } from '@react-native-gpui/core/desktop';
```

## Adding a tray icon

```tsx
await Tray.install({
  tooltip: 'My app',
  icon: require('./tray.png'),
  iconTemplate: true,
  menu: [
    { id: 'open', label: 'Open My App' },
    { type: 'separator' },
    { type: 'role', role: 'quit' },
  ],
});

const subscription = Tray.onMenuPress(id => {
  if (id === 'open') openMainWindow();
});
```

A tray that shows a `menu` reports the chosen item through `Tray.onMenuPress`. To open a window instead, give it a `component`, which is shown in a popover when the icon is clicked:

```tsx
await Tray.install({
  component: 'MenuBarPanel',
  size: { width: 320, height: 400 },
});
```

The options `Tray.install` takes, and every method of `Tray`, are in the [`Tray`](tray) reference.

## Popover position on Linux

X11 reports where the icon is, so the popover opens at it. Wayland does not, and it does not let an app place a window either, so a Wayland popover is drawn another way: in a transparent window that covers the screen's work area (the screen less what panels and docks reserve), with the popover inside it at a corner.

- **Finding the corner.** The work area is read from the compositor's XWayland, which publishes it as the standard `_NET_WORKAREA`. The edge a panel reserves shows where the tray is: with several reserved edges the thinnest wins, since a panel is thinner than a dock, and the popover goes at that edge's end, which is the right end of a horizontal panel and the bottom of a vertical one. On GNOME that is the top right, under the panel; with a taskbar at the bottom, as on KDE, it is the bottom right.
- **The click.** A panel that reports where the icon was clicked, as KDE does on a click and GNOME does on a double-click, puts the popover against the panel's edge and centred on that click, so it sits over the icon. The popover is then kept a margin inside the screen. Without a click position, or with `popoverAnchor` set, the corner is used.
- **When it cannot be found.** Without XWayland, or with nothing reserved, the compositor places an ordinary window, as before.
- **Choosing it yourself.** An app can set `popoverAnchor` (`'auto'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` or `'center'`) and `popoverOffset`, and a user can override both with `RN_GPUI_TRAY_POPOVER_ANCHOR` and `RN_GPUI_TRAY_POPOVER_OFFSET` (`x,y`), for a desktop where the automatic corner is wrong. The environment wins over the app.

```ts
await Tray.install({
  component: 'MenuBarPanel',
  popoverAnchor: 'top-left',
  popoverOffset: { x: 0, y: 4 },
});
```

Without a reported click the popover is near the icon, not on it: where along the panel the icon sits is not known. A press anywhere outside the popover closes it, and so does it losing focus. The overlay shows in Alt+Tab and the overview as a blank window, which Wayland gives an app no way to hide. Windows, macOS and X11 ignore the two options.

## Changing it later

`Tray.setTooltip`, `setTitle`, `setIcon`, `setMenu` and `setVisible` change the icon after it is installed, and `Tray.showPopover`, `hidePopover`, `togglePopover` and `setPopoverPosition` control the popover. See [`Tray`](tray#methods).

## Configuring it in desktop.json

A tray can also be set up without code. The `tray` block of [`desktop.json`](desktop-json#tray) takes a `component`, `tooltip`, `icon` and `iconTemplate`, and `accessory`, which runs the app without a Dock icon (macOS) and defaults to `true`.

## Platform notes

- **Windows** has no anchored popover. The window is placed at the click point.
- **Linux on GNOME** has no click-to-popover: its tray extension shows an icon's menu on a single click and sends the click to the app only for a double click. A double click opens the popover, and so does the built-in Open item of the menu. GNOME gives an app no icon position and no way to place a window, so the popover is drawn at the end of the panel's edge instead; see [Popover position on Linux](#popover-position-on-linux). On every Linux desktop it is drawn without a title bar, with the same [rounded frame and shadow](desktop-windows#the-window-frame) as other windows, and it closes when it loses focus. The size you set is the size of its content. Check `capabilities().tray` and `capabilities().trayPopoverAnchored`.
