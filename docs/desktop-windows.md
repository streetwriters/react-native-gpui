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

`open` resolves with a `DesktopWindow` for the new window. These are the options:

| Option                   | Type                                               | Description                                                                             |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `component`              | `string`                                           | The name registered with `AppRegistry`. Required.                                       |
| `props`                  | `Record<string, unknown>`                          | Initial props for the component.                                                        |
| `title`                  | `string`                                           | The title bar text.                                                                     |
| `width`, `height`        | `number`                                           | The size in points.                                                                     |
| `x`, `y`                 | `number`                                           | The position. Omit both to let the platform place the window.                           |
| `titleBar`               | `'default' \| 'transparent' \| 'hidden'`           | How the title bar is drawn. See [Title bar](desktop-title-bar).                         |
| `background`             | `'opaque' \| 'transparent' \| 'blurred' \| 'mica'` | What shows through the window. See [Transparent windows](#transparent-windows).         |
| `windowButtons`          | `boolean`                                          | Whether macOS draws the traffic lights. Defaults to `true`; other systems ignore it.    |
| `shadow`                 | `boolean`                                          | Whether the window has the system shadow. Defaults to `true`; only macOS draws one yet. |
| `trafficLightPosition`   | `{x: number, y: number}`                           | Where the macOS traffic lights sit in a transparent or hidden title bar.                |
| `resizable`              | `boolean`                                          | Whether the window can be resized.                                                      |
| `alwaysOnTop`            | `boolean`                                          | Keeps the window above others. Check `capabilities().alwaysOnTop`.                      |
| `visibleOnAllWorkspaces` | `boolean`                                          | Shows the window on every Space. Check `capabilities().visibleOnAllWorkspaces`.         |
| `parent`                 | `number`                                           | The id of a parent window.                                                              |

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
- Use a [`'none'` title bar](desktop-title-bar) with a `'transparent'` or `'blurred'` background, and `windowButtons` and `shadow` set to `false`, so the window has no chrome of its own.
- Summon it with a [global shortcut](desktop-keyboard-shortcuts#global-shortcuts), and hide it with `hide()` when the user dismisses it.

A click outside a window goes to whatever is behind it, and macOS can treat a click on the desktop as "show the desktop". To catch the click, make the window as large as the screen and its background a nearly invisible, clickable layer, with the visible panel inside it. Closing on focus loss with `useWindowFocus()` is the simpler option where clicks can reach another app.

## The current window

Inside a component, `useDesktopWindow()` returns the `DesktopWindow` that component is rendered in, and `useDesktopWindowId()` returns just its id. The main window has the id `MAIN_WINDOW_ID`.

```tsx
import { useDesktopWindow } from '@react-native-gpui/core/desktop';

function CloseButton() {
  const window = useDesktopWindow();
  return <Button title="Close" onPress={() => window.close()} />;
}
```

`DesktopWindow.all()` lists every open window, and `DesktopWindow.current()` is the same as the hook and must also be called while rendering.

## Controlling a window

Every method returns a promise. A method the operating system cannot perform rejects with a [`DesktopError`](desktop-app-info) whose `code` is `unsupported`.

| Method                                 | Description                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `getState()`                           | Resolves with a `WindowState`.                                                                     |
| `setTitle(title)`                      | Changes the title.                                                                                 |
| `setSize({width, height})`             | Resizes the window.                                                                                |
| `setPosition({x, y})`                  | Moves the window.                                                                                  |
| `setMinSize(size)`, `setMaxSize(size)` | Limits how far the user can resize it.                                                             |
| `setResizable(resizable)`              | Allows or forbids resizing.                                                                        |
| `minimize()`                           | Minimizes the window.                                                                              |
| `maximize()`, `unmaximize()`           | Maximizes the window or restores it.                                                               |
| `toggleMaximize()`                     | Switches between the two.                                                                          |
| `setFullscreen(fullscreen)`            | Enters or leaves full screen.                                                                      |
| `setAlwaysOnTop(onTop)`                | Keeps the window above others.                                                                     |
| `setVisibleOnAllWorkspaces(visible)`   | Shows the window on every Space, over full-screen apps when it is also on top. macOS only for now. |
| `show()`, `hide()`                     | Shows or hides the window without closing it.                                                      |
| `focus()`                              | Brings the window to the front.                                                                    |
| `startDragging()`                      | Starts moving the window with the pointer.                                                         |
| `close({force})`                       | Closes the window. See [Closing](#closing-a-window).                                               |

`WindowState` holds the `windowId`, the `bounds` (`x`, `y`, `width`, `height`), `isMaximized`, `isFullscreen`, `isFocused`, `isMinimized`, the `scaleFactor` and the `topInset`: the height of the title bar that the window's content is drawn under, which is `0` unless the window has a [`'transparent'` title bar](desktop-title-bar) on macOS (Windows and Linux always report `0`). `SafeAreaView` pads its top by `topInset`, so content inside it stays clear of the bar.

## Events

`addListener` subscribes to events of one window and returns a subscription to remove:

```tsx
useEffect(() => {
  const subscription = window.addListener('resize', event => {
    console.log('resized', event);
  });
  return () => subscription.remove();
}, [window]);
```

The event names are `focus`, `blur`, `resize`, `move`, `stateChange` and `closeRequested`. Each event carries the `windowId` of its window.

## Hooks

`useWindowState()` returns the `WindowState` of the current window and re-renders when the window moves, resizes, changes state, or gains or loses focus. The first render already has real values. `useWindowFocus()` returns only whether the window has focus, so it does not re-render when the window moves. Both take an optional window id.

```tsx
import {
  useWindowFocus,
  useWindowState,
} from '@react-native-gpui/core/desktop';

function Title() {
  const focused = useWindowFocus();
  const state = useWindowState();
  return (
    <Text style={{ opacity: focused ? 1 : 0.5 }}>{state?.bounds.width}</Text>
  );
}
```

`useWindowState()` is `null` for a window that is not open.

### Closing a window

While a `closeRequested` listener is attached, the window's close button no longer closes it. Your listener runs instead, and you decide what happens, for example to ask about unsaved changes:

```tsx
useEffect(() => {
  const subscription = window.addListener('closeRequested', async () => {
    if (await confirmDiscardChanges()) {
      await window.close({ force: true });
    }
  });
  return () => subscription.remove();
}, [window]);
```

`close({force: true})` closes the window without asking. Several listeners can be attached to one window, and the window is released as soon as the last one is removed.

## Main window options

The size, position and title bar of the main window are set in [`desktop.json`](desktop-json#window), not in code. By default the window remembers its size and position between launches; set `window.restoreState` to `false` to turn that off.

## Window size in React

`useWindowDimensions()` and `Dimensions` describe the app's main window and not the screen. To measure another window, or a part of your layout, use `onLayout`.
