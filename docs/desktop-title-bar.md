---
id: desktop-title-bar
title: Title bar
---

By default a window has the platform's title bar. To draw your own, hide or blend the platform one, and use `TitleBar` and `WindowControl` for the parts that belong to the operating system.

## Choosing a style

The `titleBar` option decides how the title bar is drawn. Set it for the main window in [`desktop.json`](desktop-json#window), or per window in `DesktopWindow.open`.

| Value           | Result                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `'default'`     | The platform's own title bar.                                                                                                              |
| `'transparent'` | The window keeps its chrome, but the app draws under the title bar. On macOS the traffic lights stay on top of your own bar.               |
| `'hidden'`      | No title bar at all. The app draws and moves its own bar.                                                                                  |
| `'none'`        | No system chrome at all. On macOS the window is borderless, with no border line or system corners; elsewhere it is the same as `'hidden'`. |

On Linux, `'transparent'` and `'hidden'` both ask the compositor for client-side decorations. A window manager that refuses leaves the native title bar in place, so check `capabilities().clientDecorations` before relying on it.

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

A transparent or hidden title bar has no area that drags the window until the app provides one: without it the window cannot be moved. Use [`TitleBar`](#titlebar), or mark the view that acts as the bar with `desktopDragRegion`. Pressing it drags the window, and double-clicking it zooms or maximizes the window. Children that handle presses themselves, such as buttons, keep working.

```tsx
<View desktopDragRegion style={{ height: 40, flexDirection: 'row' }}>
  <Text>My App</Text>
  <Button title="Settings" onPress={openSettings} />
</View>
```

## TitleBar

`TitleBar` is a ready-made bar that already handles dragging, the traffic-light inset on macOS, and the caption buttons on Windows and Linux. On Windows the caption buttons are the full-height rectangles of the system, with a red close button; on Linux they are small round buttons with a soft hover. On Linux the buttons also follow the desktop's own layout: they sit on the side the desktop puts them, in its order, and only the ones it shows (GNOME's `button-layout` setting, or KDE's `ButtonsOnLeft` and `ButtonsOnRight`). The layout is read once at startup. Their icons are the icon theme's own window icons (Yaru, Adwaita, Breeze and so on), painted in the bar's text colour; a theme without them gets drawn glyphs.

```tsx
import { TitleBar } from '@react-native-gpui/core/desktop';

<TitleBar title="My App" appearance="dark">
  <SearchField />
</TitleBar>;
```

| Prop                 | Type                   | Description                                                                           |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `title`              | `string`               | Text centered in the bar.                                                             |
| `trafficLightInset`  | `number`               | Space to leave for the macOS traffic lights, so your content does not sit under them. |
| `showCaptionButtons` | `boolean`              | Whether to draw minimize, maximize and close buttons where the platform expects them. |
| `appearance`         | `'light' \| 'dark'`    | The color scheme of the buttons.                                                      |
| `menuBar`            | `boolean`              | Whether to keep a row under the bar for the in-window menu bar. Defaults to `true`.   |
| `style`              | `StyleProp<ViewStyle>` | Styles for the bar.                                                                   |

### The menu bar

Where the menu bar is drawn in the window (Linux), a `TitleBar` keeps a row for it just under the bar, in the bar's colors, so the menu is not a strip above the title bar. Set `menuBar={false}` to keep the strip at the top of the window instead. To hide the menu bar, set `window.menuBar` to `false` in [`desktop.json`](desktop-json#window) or call `Menu.setMenuBarVisible(false)`; the row goes with it. A window without a `TitleBar` keeps the strip at the top.

## WindowControl

`WindowControl` is a single caption button. Use it to build a bar with your own look. It carries its own hover and pressed state and runs the action itself.

```tsx
import { WindowControl } from '@react-native-gpui/core/desktop';

<WindowControl
  action="close"
  style={({ hovered }) => ({
    width: 46,
    height: 32,
    backgroundColor: hovered ? '#e81123' : 'transparent',
  })}
>
  {({ hovered }) => <CloseGlyph color={hovered ? 'white' : 'black'} />}
</WindowControl>;
```

`action` is `'minimize'`, `'maximize'` or `'close'`. Both `style` and `children` can be functions of a state with `hovered`, `pressed` and `maximized`, so you can switch the maximize glyph to a restore glyph. A `disabled` prop turns the button off.
