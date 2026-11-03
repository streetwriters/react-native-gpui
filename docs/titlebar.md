---
id: titlebar
title: TitleBar
---

A ready-made title bar for a window that draws its own. It handles dragging, the traffic-light inset on macOS, and the caption buttons on Windows and Linux. Use it with a `'transparent'` or `'hidden'` [title bar](desktop-title-bar) style.

On Windows the caption buttons are the full-height rectangles of the system, with a red close button. On Linux they are small round buttons that follow the desktop: they sit on the side the desktop puts them, in its order, and only the ones it shows (GNOME's `button-layout` setting, or KDE's `ButtonsOnLeft` and `ButtonsOnRight`), with the icon theme's own window icons painted in the bar's text colour. Where the desktop gives no layout the buttons go on the right; set [`window.windowControlsPosition`](desktop-json#windowcontrolsposition) to change that.

Where the compositor draws the window's frame itself (KDE and most X11 window managers), the bar shows only its children, as a toolbar row: no title, no caption buttons and no drag area, and nothing at all when it has no children.

## Example

```tsx
import { TitleBar } from '@react-native-gpui/core/desktop';

function App() {
  return (
    <TitleBar title="My App" appearance="dark">
      <SearchField />
    </TitleBar>
  );
}
```

---

# Reference

## Props

### `title`

Text centered in the bar.

| Type   |
| ------ |
| string |

---

### `children`

Content placed in the bar, between the title and the caption buttons. Presses on it, such as buttons, keep working inside the drag area.

| Type |
| ---- |
| node |

---

### `trafficLightInset`

Space to leave on the left for the macOS traffic lights, so your content does not sit under them.

| Type   | Default                      |
| ------ | ---------------------------- |
| number | `78` on macOS, `0` elsewhere |

---

### `showCaptionButtons`

Whether to draw minimize, maximize and close buttons where the platform expects them. By default they are drawn where the window is frameless, except on macOS, which keeps its traffic lights.

| Type    | Default               |
| ------- | --------------------- |
| boolean | depends on the window |

---

### `appearance`

The colour scheme of the buttons. By default it follows the background colour in `style`, and otherwise the system.

| Type                      |
| ------------------------- |
| enum(`'light'`, `'dark'`) |

---

### `menuBar`

Linux. Whether to keep a row under the bar for the in-window [menu bar](menu), so the menu is not a strip above the title bar. Set it to `false` to keep the strip at the top of the window.

| Type    | Default |
| ------- | ------- |
| boolean | `true`  |

---

### `style`

Styles for the bar.

| Type                              |
| --------------------------------- |
| [View Style](view-style-props.md) |
