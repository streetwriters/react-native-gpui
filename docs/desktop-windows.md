---
id: desktop-windows
title: Windows
---

An app opens with one window, the main window. The `DesktopWindow` class opens more, and lets you move, resize, minimize and close any of them. Every window renders its own React tree, and all windows share one JavaScript runtime, so state kept in a module is visible to every window.

```tsx
import {
  DesktopWindow,
  useDesktopWindow,
} from '@react-native-gpui/core/desktop';
```

## Opening a window

`DesktopWindow.open` opens a window that renders a component registered with `AppRegistry`:

```tsx
import { AppRegistry } from 'react-native';
import { DesktopWindow } from '@react-native-gpui/core/desktop';

AppRegistry.registerComponent('Preferences', () => PreferencesScreen);

async function openPreferences() {
  const preferences = await DesktopWindow.open({
    component: 'Preferences',
    title: 'Preferences',
    width: 480,
    height: 360,
    resizable: false,
  });
  await preferences.focus();
}
```

`open` resolves with a `DesktopWindow` for the new window. The options, and every method of the window, are in the [`DesktopWindow`](desktopwindow) reference.

## Transparent windows

By default a window is opaque. Set `background` to let the desktop show through:

- `'transparent'` is plain alpha transparency. Your own colors decide how much shows.
- `'blurred'` blurs what is behind the window.
- `'mica'` is the Windows 11 material. On other systems the window stays opaque.

The root view of your app has to be transparent as well, because anything you paint over the window is opaque. Use colors with an alpha channel for the parts you want to see through. Combine it with a [transparent or hidden title bar](desktop-title-bar) to remove the system title bar's own background.

For a palette or a HUD that looks like nothing but its own content, also set `windowButtons` and `shadow` to `false`, which hides the macOS traffic lights and the system shadow, and use a `'hidden'` title bar so nothing of the platform's own chrome is left.

Set them for the main window in [`desktop.json`](desktop-json#window), or per window in `DesktopWindow.open`.

## Launcher windows

A window that appears on demand, like a command palette, combines a few options so it shows on whatever the user is doing, including a full-screen app:

- Set [`accessory`](desktop-json#app) in `desktop.json`, so the app has no Dock icon. This is what lets its windows show over another app's full-screen Space.
- Open the window with `alwaysOnTop` and `visibleOnAllWorkspaces`, or call `setAlwaysOnTop` and `setVisibleOnAllWorkspaces` on the main window.
  Only macOS shows a window on every Space; on Windows and Linux `visibleOnAllWorkspaces` is ignored.
- Use a [`'none'` title bar](desktop-title-bar) with a `'transparent'` or `'blurred'` background, and `windowButtons` and `shadow` set to `false`, so the window has no chrome of its own.
- Summon it with a [global shortcut](desktop-keyboard-shortcuts#global-shortcuts), and hide it with `hide()` when the user dismisses it.

A click outside a window goes to whatever is behind it, and macOS can treat a click on the desktop as "show the desktop". To catch the click, make the window as large as the screen and its background a nearly invisible, clickable layer, with the visible panel inside it. Closing on focus loss with `useWindowFocus()` is the simpler option where clicks can reach another app.

## The current window

Inside a component, [`useDesktopWindow()`](desktopwindow#usedesktopwindow) returns the `DesktopWindow` that component is rendered in, and [`useWindowState()`](desktopwindow#usewindowstate) and [`useWindowFocus()`](desktopwindow#usewindowfocus) follow its size, position and focus. A component can also subscribe to a window's events, and veto the close button while it has unsaved changes. See [`DesktopWindow`](desktopwindow#closing-a-window).

## Windowing on Linux

Linux has no single window system. X11 and Wayland differ, and so do GNOME, KDE and the others on top of them: who draws the title bar, where the caption buttons go, how rounded a window is, and whether an app may place or raise its own windows. This page describes what react-native-gpui does on each, and what an app can set.

The rule throughout is to follow the desktop. Values that a desktop defines, such as the button layout, the icons and the shape of a window, are read from it at run time and not written into the app. Where the desktop gives no answer, a fallback is used, and most fallbacks can be set in [`desktop.json`](desktop-json#window).

### Who draws the window

A window has either server-side decorations (the compositor draws the title bar and frame) or client-side decorations (the app draws them).

| Desktop              | Default window                                                              | Window with a `'transparent'`, `'hidden'` or `'none'` title bar                                               |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GNOME on Wayland     | Client-side. Mutter does not draw frames, so the app must draw its own bar. | Client-side.                                                                                                  |
| KDE Plasma (Wayland) | Server-side: KWin draws the bar.                                            | Client-side. KWin draws nothing.                                                                              |
| X11                  | The window manager's frame.                                                 | Client-side where the window manager and a compositor support it, otherwise the window manager's frame stays. |

On GNOME a window with the default title bar therefore has no title bar of its own. Render a [`TitleBar`](desktop-title-bar) in every window, and set `titleBar` to `'transparent'` so the intent is the same on KDE.

Read `capabilities().clientDecorations` to find out which one a window got. The first call waits until the window has reported what the compositor decided, so the answer is correct when your first component renders. If the compositor changes it later, `useClientDecorations()` re-renders with the new value.

A [`TitleBar`](desktop-title-bar) in a window whose frame the compositor draws shows only its children, as a toolbar row: no title, no caption buttons and no drag area, and nothing when it has no children.

### Window controls

The minimize, maximize and close buttons of a `TitleBar` follow the desktop.

- **Side, order and which buttons exist.** On GNOME and other GTK desktops the layout is the `button-layout` setting, so a desktop that shows only a close button, or puts the buttons on the left, gets exactly that. On KDE it is `ButtonsOnLeft` and `ButtonsOnRight` in `kwinrc`. The layout is read once at startup.
- **Icons.** The buttons draw the icon theme's own `window-close-symbolic`, `window-minimize-symbolic`, `window-maximize-symbolic` and `window-restore-symbolic` icons, found through the theme and the themes it inherits from (Yaru, Adwaita, Breeze and others), in the bar's text colour. A theme without them gets drawn glyphs.
- **Fallback side.** When the desktop states no layout, the buttons go on the right. Set [`window.windowControlsPosition`](desktop-json#window) to `"left"` to change that.

Every `TitleBar` in every window uses the same layout and icons.

### The window frame

A client-decorated window draws its own frame: rounded corners, a hairline border and a shadow, in a see-through margin around the content. This applies to every window, popovers included, and all of them use the same values. A window that asks for no `shadow`, a `'none'` title bar or a see-through `background` draws its own look instead and gets no frame, because the frame's shadow sits under the content and would show through. The margin and the rounding go away while the window is maximized, fullscreen or tiled, and nothing is drawn where the compositor draws the frame itself.

The values are measured from the desktop's own toolkit and not assumed, so they follow the distro and its theme:

1. On the first launch a short-lived child process of the app renders a window frame off-screen with the toolkit that is installed: GTK 4 with libadwaita, then GTK 4 alone, then GTK 3. The first that works gives the answer, so a desktop with only plain GTK gets its own theme's frame and not libadwaita's.
2. The corner radius, border and shadow are read from the pixels. The shadow is fitted to the measured falloff on three edges, which gives its opacity, blur, spread and downward offset.
3. The result is kept in `window-frame.json` in the app's own cache folder (`~/.cache/<app id>/`), written on the user's machine at run time and not part of the package. It is measured again only when the GTK theme, the colour scheme, GTK or libadwaita, the theme's stylesheet or the runtime changes. A first launch can wait for the measurement for up to two and a half seconds; later launches read the file.

The app never loads GTK itself, and no GTK window is ever shown.

| `desktop.json` option | Effect                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `window.cornerRadius` | The corner radius used where nothing can be measured. It never overrides a measured value. |
| `window.shadow`       | Set to `false` for no shadow and no margin.                                                |

Where nothing can be measured (a Qt-only system, a headless session), a 12-point radius and a 14-point shadow are used. Set `RN_GPUI_FRAME_PROBE=off` to skip the measurement altogether.

On KDE the frame is only drawn for a client-decorated window, and it is the GTK theme's, since Qt has no way to render a window frame for measuring. It can differ from the shadow KWin draws around its own windows.

### The menu bar

Linux has no application menu bar of its own, so the menu from [`Menu`](desktop-application-menu) is drawn inside the window, by the app. It is not a native menu, does not use a global menu such as KDE's, and does not pick up the desktop's menu styling.

- With a [`TitleBar`](desktop-title-bar#the-menu-bar), the bar sits in a row just under the title bar, in the bar's colours. Set `menuBar={false}` on the `TitleBar` to keep the strip at the top of the window instead. `Menu.setMenuBarSlot` and `Menu.clearMenuBarSlot` let a custom bar reserve the row itself.
- To hide it, set `window.menuBar` to `false` in `desktop.json`, or call `Menu.setMenuBarVisible(false)`. Accelerators keep working while it is hidden.
- Accelerators are shown the way a menu writes them, as `Ctrl+Shift+Z`.
- `capabilities().menuBarInWindow` is true where the bar is drawn in the window. `RN_GPUI_MENU_BAR` set to `native` or `gpui` forces the choice.

### Placement and stacking

| Behaviour                           | X11                                                                                                                                                                                         | Wayland                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Opening a window at `x`, `y`        | Asked of the window manager, which may ignore it.                                                                                                                                           | Ignored: the compositor places windows.               |
| `alwaysOnTop`                       | Supported (`_NET_WM_STATE_ABOVE`).                                                                                                                                                          | Not supported. `capabilities().alwaysOnTop` is false. |
| `visibleOnAllWorkspaces`            | Ignored.                                                                                                                                                                                    | Ignored.                                              |
| Global shortcuts                    | Supported.                                                                                                                                                                                  | Bound through the desktop portal; the user allows it. |
| Transparent and blurred backgrounds | Need a compositing manager (picom, KWin and others). A window with a `'none'` title bar loses the window manager's frame even where the window manager cannot leave the drawing to the app. | Transparency works; blur is not applied.              |

Check `capabilities().windowPosition`, `capabilities().alwaysOnTop` and `capabilities().visibleOnAllWorkspaces` before offering a control that depends on them.

### Launcher windows on Wayland

Wayland will not let an app place a window, so a palette would open wherever the compositor likes: the top-left corner on GNOME 46, for one. A window with a [`'none'` title bar](desktop-title-bar) and a `'transparent'` or `'blurred'` background, opened without `x` and `y`, is therefore drawn in the middle of a transparent window that covers the work area. The compositor puts that window on the monitor it chooses for a new window, which is normally the one in use, and the palette is centred on it.

Only the palette takes clicks. A click anywhere else goes to the window or the desktop underneath, so close the window when it loses focus, with `useWindowFocus()`.

Two things show that the window is bigger than the palette: `getState()` reports the size of the work area and not of the palette, and the window shows in Alt+Tab and the overview as a blank, screen-sized entry. Pass `x` and `y` to place the window yourself on X11 instead.

### Resizing

A client-decorated window has no frame to grab, so the app draws an invisible eight-point border along and around the edges. Pressing it starts a native resize, with the cursor the edge calls for. It is only drawn for a resizable window that really is client-decorated.

### Tray icons

A tray popover is a window like the others here: no title bar, the same frame, and a size that is the size of its content. Where the compositor lets the app place windows (X11) it opens at the icon; on Wayland it is drawn at the end of the panel's edge, in a transparent window over the work area. See [Tray](desktop-tray#platform-notes) for how a tray icon and its popover behave on GNOME and KDE.

## Main window options

The size, position and title bar of the main window are set in [`desktop.json`](desktop-json#window), not in code. By default the window remembers its size and position between launches; set `window.restoreState` to `false` to turn that off.

## Window size in React

`useWindowDimensions()` and `Dimensions` describe the app's main window and not the screen. To measure another window, or a part of your layout, use `onLayout`.
