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

### Options

| Option                   | Description                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`                     | A stable id. Defaults to `tray`.                                                                                 |
| `tooltip`                | The tooltip text.                                                                                                |
| `title`                  | Text beside the icon. macOS and Linux only; Windows trays have no title.                                         |
| `icon`                   | The icon, as an `<Image source>` or a path. Without one, the app's icon, else a built-in glyph.                  |
| `iconTemplate`           | macOS: draw the icon as a template that the menu bar tints for light and dark mode. Use it for monochrome icons. |
| `component`              | An `AppRegistry` component to render in a popover on click.                                                      |
| `size`                   | The size of the popover.                                                                                         |
| `menu`                   | A [menu](desktop-application-menu#menu-items) shown instead of the popover.                                      |
| `menuOnLeftClick`        | Shows the menu on a left click as well.                                                                          |
| `quitOnLastWindowClosed` | Quits when the last window closes. Defaults to `false`: a tray app keeps running without a window.               |
| `hideWindowOnClose`      | Hides the last window on close instead of closing it, so it reopens in the same state. Defaults to `false`.      |

With `hideWindowOnClose` off, reopening the app from the tray starts from the first screen. With it on, the window and its state are kept, at the cost of the hidden React tree staying alive.

## Changing it later

| Method                           | Description                            |
| -------------------------------- | -------------------------------------- |
| `Tray.setTooltip(text)`          | Changes the tooltip. `null` clears it. |
| `Tray.setTitle(text)`            | Changes the title. `null` clears it.   |
| `Tray.setIcon(icon, {template})` | Replaces the icon.                     |
| `Tray.setMenu(items)`            | Replaces the menu. `null` removes it.  |
| `Tray.setVisible(visible)`       | Shows or hides the icon.               |
| `Tray.getState()`                | Resolves with the current state.       |
| `Tray.destroy()`                 | Removes the tray icon.                 |

## Configuring it in desktop.json

A tray can also be set up without code. The `tray` block of [`desktop.json`](desktop-json#tray) takes a `component`, `tooltip`, `icon` and `iconTemplate`, and `accessory`, which runs the app without a Dock icon (macOS) and defaults to `true`.

## Platform notes

- **Windows** has no anchored popover. The window is placed at the click point.
- **Linux on GNOME** has no click-to-popover: its tray extension shows an icon's menu on a single click and sends the click to the app only for a double click. A double click opens the popover, and so does the built-in Open item of the menu. The popover is an ordinary window that GNOME places itself, over the app's other windows or in the middle of the screen, because GNOME has no way for an app to anchor a window to a panel icon (it offers no layer-shell and the tray gives the app no icon position). On every Linux desktop it is drawn without a title bar, with the same [rounded frame and shadow](desktop-windows#the-window-frame) as other windows, and it closes when it loses focus. The size you set is the size of its content. Check `capabilities().tray` and `capabilities().trayPopoverAnchored`.
