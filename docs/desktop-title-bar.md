---
id: desktop-title-bar
title: Title bar
---

By default a window has the platform's title bar. To draw your own, hide or blend the platform one, and use `TitleBar` and `WindowControl` for the parts that belong to the operating system.

## Choosing a style

The `titleBar` option decides how the title bar is drawn. Set it for the main window in [`desktop.json`](desktop-json#window), or per window in `DesktopWindow.open`.

- `'default'` is the platform's own title bar.
- `'transparent'` keeps the window's chrome, but the app draws under the title bar. On macOS the traffic lights stay on top of your own bar.
- `'hidden'` has no title bar at all. The app draws and moves its own bar.
- `'none'` has no system chrome at all. On macOS the window is borderless, with no border line or system corners; elsewhere it is the same as `'hidden'`.

On Linux, `'transparent'` and `'hidden'` both ask the compositor for client-side decorations. A window manager that refuses leaves the native title bar in place, so check `capabilities().clientDecorations` before relying on it. The answer is known before the first `TitleBar` renders, and `useClientDecorations()` follows it if the compositor changes it later. A `TitleBar` in a window whose frame the compositor draws shows only its children, as a toolbar row: no title, no caption buttons and no drag area, and nothing at all when it has no children.

```json title="desktop/desktop.json"
{
  "window": {
    "titleBar": "hidden",
    "trafficLightPosition": { "x": 16, "y": 18 }
  }
}
```

`trafficLightPosition` moves the macOS traffic lights, in points from the window's top-left corner. Windows and Linux ignore it.

## Content under the bar

A `'transparent'` or `'hidden'` title bar leaves the window's content behind the bar. Wrap the content in `SafeAreaView`, or read `topInset` from [`useWindowState()`](desktop-windows), to keep it clear of the bar. On Windows and Linux the inset is the height of the `TitleBar` component, 38 points; on Linux it is zero while the compositor keeps its own bar. A window with the `'default'` title bar has no inset, and `SafeAreaView` is a plain `View` there.

## Drag regions

A transparent or hidden title bar has no area that drags the window until the app provides one: without it the window cannot be moved. Use [`TitleBar`](titlebar), or mark the view that acts as the bar with `desktopDragRegion`. Pressing it drags the window, and double-clicking it zooms or maximizes the window. Children that handle presses themselves, such as buttons, keep working.

```tsx
<View desktopDragRegion style={{ height: 40, flexDirection: 'row' }}>
  <Text>My App</Text>
  <Button title="Settings" onPress={openSettings} />
</View>
```

## TitleBar and WindowControl

[`TitleBar`](titlebar) is a ready-made bar that handles dragging, the traffic-light inset on macOS, and the caption buttons on Windows and Linux. On Linux the buttons follow the desktop's own layout and icons. [`WindowControl`](windowcontrol) is a single caption button, for building a bar with your own look.

```tsx
import { TitleBar } from '@react-native-gpui/core/desktop';

<TitleBar title="My App" appearance="dark">
  <SearchField />
</TitleBar>;
```

## The window frame on Linux

A client-decorated window draws its own rounded corners, border and shadow, measured from the desktop's toolkit. See [Windowing on Linux](desktop-windows#the-window-frame).

## The menu bar

Where the menu bar is drawn in the window (Linux), a `TitleBar` keeps a row for it just under the bar, in the bar's colors, so the menu is not a strip above the title bar. Set `menuBar={false}` to keep the strip at the top of the window instead. To hide the menu bar, set `window.menuBar` to `false` in [`desktop.json`](desktop-json#window) or call `Menu.setMenuBarVisible(false)`; the row goes with it. A window without a `TitleBar` keeps the strip at the top.
