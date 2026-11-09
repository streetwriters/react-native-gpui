---
id: desktopwindow
title: DesktopWindow
---

Opens windows and controls them. An app opens with one window, the main window; `DesktopWindow` opens more and lets you move, resize, minimize and close any of them. Every window renders its own React tree, and all windows share one JavaScript runtime, so state kept in a module is visible to every window.

Every method returns a promise. A method the operating system cannot perform rejects with a [`DesktopError`](desktop#desktoperror) whose `code` is `unsupported`. For how windows look and behave on each platform, see [Windows](desktop-windows).

## Example

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

Inside a component, `useDesktopWindow()` returns the window the component is rendered in:

```tsx
function CloseButton() {
  const window = useDesktopWindow();
  return <Button title="Close" onPress={() => window.close()} />;
}
```

---

# Reference

## Methods

### `open()`

```tsx
static open(options: OpenWindowOptions): Promise<DesktopWindow>;
```

Opens a window that renders a component registered with `AppRegistry`, and resolves with the `DesktopWindow` for it. See the [options](#open-options).

---

### `all()`

```tsx
static all(): Promise<DesktopWindow[]>;
```

Resolves with every open window.

---

### `current()`

```tsx
static current(): DesktopWindow;
```

The window the calling component is rendered in. Same as [`useDesktopWindow()`](#usedesktopwindow), and it must also be called while rendering.

---

### `getState()`

```tsx
getState(): Promise<WindowState>;
```

Resolves with the window's [state](#windowstate).

---

### `setTitle()`

```tsx
setTitle(title: string): Promise<void>;
```

Changes the title.

---

### `setZoomFactor()`

```tsx
setZoomFactor(factor: number): Promise<void>;
```

Scales the window's content: `1` is the natural size and `2` doubles it. The content is laid out at the window's size divided by the factor, so `useWindowDimensions()` reports less room when zoomed in, and pointer input follows the zoomed content. The factor is clamped to 0.25 to 5 and lasts until the window closes. The app remembers it: listen for `stateChange` events (they carry `zoomFactor`), save the value, and call `setZoomFactor()` on the next launch.

Menus and popovers that the system positions from window coordinates are not scaled with the content yet. A [`tooltip`](view#tooltip) is.

---

### `getZoomFactor()`

```tsx
getZoomFactor(): Promise<number>;
```

The factor set with `setZoomFactor()`, `1` by default.

---

### `getTitle()`

```tsx
getTitle(): Promise<string>;
```

The title set with `setTitle()` or the `title` option.

---

### `setBackgroundColor()`

```tsx
setBackgroundColor(color: ColorValue): Promise<void>;
```

Paints the window behind its content. It shows while the window is resized and wherever the content is transparent. Takes a plain color. macOS only for now; elsewhere it rejects with `unsupported`.

---

### `setChromeAppearance()`

```tsx
setChromeAppearance(appearance: 'light' | 'dark' | 'system'): Promise<void>;
```

Gives the window's native title bar and traffic lights a light or dark look, or `'system'` to follow the system again. macOS only for now; elsewhere it rejects with `unsupported`. A title bar the app draws itself takes its colors from its styles.

---

### `setSize()`

```tsx
setSize(size: {width: number; height: number}): Promise<void>;
```

Resizes the window, in points.

---

### `setPosition()`

```tsx
setPosition(position: {x: number; y: number}): Promise<void>;
```

Moves the window. Wayland places windows itself and ignores it; check `capabilities().windowPosition`.

---

### `setMinSize()`

```tsx
setMinSize(size: {width: number; height: number}): Promise<void>;
```

Limits how small the user can resize the window.

---

### `setMaxSize()`

```tsx
setMaxSize(size: {width: number; height: number}): Promise<void>;
```

Limits how large the user can resize the window.

---

### `setResizable()`

```tsx
setResizable(resizable: boolean): Promise<void>;
```

Allows or forbids resizing.

---

### `minimize()`

```tsx
minimize(): Promise<void>;
```

Minimizes the window.

---

### `maximize()`

```tsx
maximize(): Promise<void>;
```

Maximizes the window.

---

### `unmaximize()`

```tsx
unmaximize(): Promise<void>;
```

Restores a maximized window.

---

### `toggleMaximize()`

```tsx
toggleMaximize(): Promise<void>;
```

Switches between maximized and restored.

---

### `setFullscreen()`

```tsx
setFullscreen(fullscreen: boolean): Promise<void>;
```

Enters or leaves full screen.

---

### `setAlwaysOnTop()`

```tsx
setAlwaysOnTop(onTop: boolean): Promise<void>;
```

Keeps the window above others. X11, Windows and macOS only.

---

### `setVisibleOnAllWorkspaces()`

```tsx
setVisibleOnAllWorkspaces(visible: boolean): Promise<void>;
```

Shows the window on every Space, over full-screen apps when it is also on top. macOS only for now; elsewhere it is ignored.

---

### `show()`

```tsx
show(): Promise<void>;
```

Shows the window without opening a new one.

---

### `hide()`

```tsx
hide(): Promise<void>;
```

Hides the window without closing it.

---

### `focus()`

```tsx
focus(): Promise<void>;
```

Brings the window to the front.

---

### `startDragging()`

```tsx
startDragging(): Promise<void>;
```

Starts moving the window with the pointer.

---

### `close()`

```tsx
close(options?: {force?: boolean}): Promise<void>;
```

Closes the window. While a `closeRequested` listener is attached the window's close button runs the listener instead, and `close({force: true})` closes the window without asking. See [Closing a window](#closing-a-window).

---

### `addListener()`

```tsx
addListener(name: WindowEventName, listener: (event: WindowEvent) => void): Subscription;
```

Subscribes to an event of this window and returns a subscription to remove. The event names are `focus`, `blur`, `resize`, `move`, `stateChange` and `closeRequested`, and each event carries the `windowId` of its window. `stateChange` also carries the fields that changed (`isMaximized`, `isMinimized`, `isFullscreen`, `isVisible`, `title`, `zoomFactor`). Several listeners can be attached to one window, and the window is released as soon as the last one is removed.

---

## Open options

The object `DesktopWindow.open` takes.

### `component`

The name registered with `AppRegistry`.

| Type   | Required |
| ------ | -------- |
| string | **Yes**  |

---

### `props`

Initial props for the component.

| Type   |
| ------ |
| object |

---

### `title`

The title bar text.

| Type   |
| ------ |
| string |

---

### `width`

The width in points.

| Type   |
| ------ |
| number |

---

### `height`

The height in points.

| Type   |
| ------ |
| number |

---

### `x`

The position. Omit both `x` and `y` to let the platform place the window. Wayland always places it.

| Type   |
| ------ |
| number |

---

### `y`

The position. See `x`.

| Type   |
| ------ |
| number |

---

### `titleBar`

How the title bar is drawn. See [Title bar](desktop-title-bar).

| Type                                                     | Default     |
| -------------------------------------------------------- | ----------- |
| enum(`'default'`, `'transparent'`, `'hidden'`, `'none'`) | `'default'` |

---

### `background`

What shows through the window. See [Transparent windows](desktop-windows#transparent-windows).

| Type                                                     | Default    |
| -------------------------------------------------------- | ---------- |
| enum(`'opaque'`, `'transparent'`, `'blurred'`, `'mica'`) | `'opaque'` |

---

### `windowButtons`

Whether macOS draws the traffic lights. Other systems ignore it.

| Type    | Default |
| ------- | ------- |
| boolean | `true`  |

---

### `shadow`

Whether the window has the system shadow. On Linux it is the shadow a client-decorated window draws around itself.

| Type    | Default |
| ------- | ------- |
| boolean | `true`  |

---

### `trafficLightPosition`

Where the macOS traffic lights sit in a transparent or hidden title bar.

| Type                            |
| ------------------------------- |
| object `{x: number, y: number}` |

---

### `resizable`

Whether the window can be resized.

| Type    | Default |
| ------- | ------- |
| boolean | `true`  |

---

### `alwaysOnTop`

Keeps the window above others. Check `capabilities().alwaysOnTop`. Where the platform cannot do it (Wayland) the window still opens, and the request is skipped.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `visibleOnAllWorkspaces`

Shows the window on every Space. Check `capabilities().visibleOnAllWorkspaces`. Where the platform cannot do it the window still opens, and the request is skipped.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `parent`

The id of a parent window.

| Type   |
| ------ |
| number |

---

## WindowState

What `getState()` and `useWindowState()` give.

### `windowId`

The id of the window.

---

### `bounds`

`x`, `y`, `width` and `height`, in points.

---

### `isMaximized`

Whether the window is maximized.

---

### `isFullscreen`

Whether the window is full screen.

---

### `isFocused`

Whether the window has focus.

---

### `isVisible`

`false` while the window is hidden with `hide()`. A minimized window is still visible.

| Type    |
| ------- |
| boolean |

---

### `title`

The window's title.

| Type   |
| ------ |
| string |

---

### `zoomFactor`

The content scale set with `setZoomFactor()`.

| Type   |
| ------ |
| number |

---

### `isMinimized`

Whether the window is minimized.

---

### `scaleFactor`

The display's scale factor.

---

### `topInset`

The height of the title bar that the window's content is drawn under. It is `0` unless the window has a [`'transparent'` title bar](desktop-title-bar) on macOS; Windows and Linux always report `0`. `SafeAreaView` pads its top by it.

---

## Hooks

### `useDesktopWindow()`

```tsx
function useDesktopWindow(): DesktopWindow;
```

Returns the `DesktopWindow` the component is rendered in.

---

### `useDesktopWindowId()`

```tsx
function useDesktopWindowId(): number;
```

Returns just the id of the current window. The main window has the id `MAIN_WINDOW_ID`.

---

### `useWindowState()`

```tsx
function useWindowState(windowId?: number): WindowState | null;
```

Returns the [state](#windowstate) of a window and re-renders when it moves, resizes, changes state, or gains or loses focus. The first render already has real values. It is `null` for a window that is not open. Takes an optional window id, the current window by default.

---

### `useWindowFocus()`

```tsx
function useWindowFocus(windowId?: number): boolean;
```

Returns only whether the window has focus, so it does not re-render when the window moves. Takes an optional window id.

---

## Closing a window

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
