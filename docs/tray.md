---
id: tray
title: Tray
---

Puts an icon in the menu bar on macOS and in the notification area on Windows and Linux. A click on it opens a popover window that renders a React component, which makes it possible to build menu-bar apps, or a menu instead.

For how the popover is placed on each platform, and the Linux notes, see the [Tray guide](desktop-tray).

## Example

```tsx
import { Tray } from '@react-native-gpui/core/desktop';

await Tray.install({
  component: 'MenuBarPanel',
  tooltip: 'My app',
  size: { width: 320, height: 400 },
});
```

A tray that shows a `menu` reports the chosen item through `Tray.onMenuPress`. An item can open the popover from code, which is how to reach it where the desktop does not send a plain click (GNOME):

```tsx
await Tray.install({
  component: 'MenuBarPanel',
  menu: [
    { id: 'open', label: 'Open panel' },
    { id: 'quit', label: 'Quit' },
  ],
});

Tray.onMenuPress(id => {
  if (id === 'open') {
    Tray.showPopover();
  }
});
```

---

# Reference

## Methods

### `install()`

```tsx
install(options?: TrayOptions): Promise<{id: string}>;
```

Adds the tray icon, and resolves with its id. A tray with a `component` shows it in a popover on click.

---

### `destroy()`

```tsx
destroy(): Promise<void>;
```

Removes the tray icon.

---

### `setTooltip()`

```tsx
setTooltip(tooltip: string | null): Promise<void>;
```

Changes the tooltip. `null` clears it.

---

### `setTitle()`

```tsx
setTitle(title: string | null): Promise<void>;
```

Changes the title. `null` clears it.

---

### `setIcon()`

```tsx
setIcon(icon: DesktopIcon, options?: {template?: boolean}): Promise<void>;
```

Replaces the icon. `template` is as in [`iconTemplate`](#icontemplate).

---

### `setMenu()`

```tsx
setMenu(items: MenuItemSpec[] | null): Promise<void>;
```

Replaces the menu. `null` removes it.

---

### `setVisible()`

```tsx
setVisible(visible: boolean): Promise<void>;
```

Shows or hides the icon.

---

### `showPopover()`

```tsx
showPopover(): Promise<void>;
```

Opens the popover, as a click on the icon does. Use it to open the popover from something else, such as an item of the tray's menu. Rejects when the tray has no `component`.

---

### `hidePopover()`

```tsx
hidePopover(): Promise<void>;
```

Closes the popover.

---

### `togglePopover()`

```tsx
togglePopover(): Promise<void>;
```

Opens the popover, or closes it when it is open.

---

### `setPopoverPosition()`

```tsx
setPopoverPosition(position: {anchor?: PopoverAnchor; offset?: {x: number; y: number}}): Promise<void>;
```

Changes where the popover opens next time, on a desktop that leaves that to the app (Wayland). What is left out stays as it was.

---

### `getState()`

```tsx
getState(): Promise<TrayState>;
```

Resolves with the current state: `installed`, `id`, `tooltip`, `visible`, `component` and the id of the open `popover`.

---

### `onMenuPress()`

```tsx
onMenuPress(handler: (id: string) => void): {remove: () => void};
```

Listens for the tray menu's items. The handler gets the item's `id`. Returns a subscription to remove.

---

## Options

The object `Tray.install` takes.

### `id`

A stable id.

| Type   | Default  |
| ------ | -------- |
| string | `'tray'` |

---

### `tooltip`

The tooltip text.

| Type   |
| ------ |
| string |

---

### `title`

Text beside the icon. macOS and Linux only; Windows trays have no title.

| Type   |
| ------ |
| string |

---

### `icon`

The icon, as an `<Image source>` or a path. Without one, the app's icon, else a built-in glyph.

| Type                                                                    |
| ----------------------------------------------------------------------- |
| [ImageSource](https://reactnative.dev/docs/0.87/image#source) or string |

---

### `iconTemplate`

macOS: draw the icon as a template that the menu bar tints for light and dark mode. Use it for monochrome icons.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `component`

An `AppRegistry` component to render in a popover on click.

| Type   |
| ------ |
| string |

---

### `size`

The size of the popover, in points. It is the size of the popover's content.

| Type                                     | Default                     |
| ---------------------------------------- | --------------------------- |
| object `{width: number, height: number}` | `{width: 320, height: 420}` |

---

### `menu`

A [menu](applicationmenu#items) shown instead of the popover.

| Type                                           |
| ---------------------------------------------- |
| array of [MenuItemSpec](applicationmenu#items) |

---

### `menuOnLeftClick`

Shows the menu on a left click as well.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `quitOnLastWindowClosed`

Quits when the last window closes. By default a tray app keeps running without a window.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `hideWindowOnClose`

Hides the last window on close instead of closing it, so it reopens in the same state, at the cost of the hidden React tree staying alive. With it off, reopening the app from the tray starts from the first screen. Has no effect together with `quitOnLastWindowClosed`.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `popoverAnchor`

Linux on Wayland. The corner of the screen's work area the popover is drawn in. `'auto'` puts it at the end of the panel's edge, found from the work area, or centred on the click when the panel reports one. Ignored where the popover opens at the icon. See [Popover position on Linux](desktop-tray#popover-position-on-linux).

| Type                                                                                       | Default  |
| ------------------------------------------------------------------------------------------ | -------- |
| enum(`'auto'`, `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'`, `'center'`) | `'auto'` |

---

### `popoverOffset`

Linux on Wayland. Moves the popover from its corner, in points.

| Type                            | Default        |
| ------------------------------- | -------------- |
| object `{x: number, y: number}` | `{x: 0, y: 0}` |
