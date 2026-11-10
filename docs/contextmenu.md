---
id: contextmenu
title: ContextMenu
---

Opens a context menu from code. For a menu on a right click use the [`ContextMenuView`](contextmenuview) component, and for the event without a menu see [Context menus](desktop-context-menus#handling-the-event-yourself).

## Example

```tsx
import { ContextMenu } from '@react-native-gpui/core/desktop';

const id = await ContextMenu.show(
  [
    { id: 'rename', label: 'Rename' },
    { id: 'delete', label: 'Delete' },
  ],
  { x: 120, y: 80 },
);
```

---

# Reference

## Methods

### `show()`

```tsx
ContextMenu.show(items: MenuItemSpec[], options?: {x?: number; y?: number; windowId?: number; presentation?: ContextMenuPresentation}): Promise<string | null>;
```

Opens a menu from code and resolves with the chosen id, or `null` when it was dismissed. `x` and `y` are window coordinates.

---

### `setPresentation()`

```tsx
ContextMenu.setPresentation(presentation: ContextMenuPresentation): void;
```

Sets the app-wide presentation that `'default'` means.

---

### `setTheme()`

```tsx
ContextMenu.setTheme(theme: MenuThemeSet): void;
```

Overrides the built-in `light` and `dark` theme tokens of the custom menu.

---

### `setRenderers()`

```tsx
ContextMenu.setRenderers(renderers: MenuRenderers | undefined): void;
```

Replaces the custom menu's building blocks. A replacement renderer only draws: placement, keyboard handling and dismissal stay with the host. Pass `undefined` to go back to the built-in.

---

## Presentations

How a menu is drawn.

### `native`

The platform's own menu. It opens without JavaScript, so it works while JavaScript is busy.

---

### `custom`

A menu drawn by React in the window, which looks the same on every platform and can be themed. It is at most 80% of the window's height; a menu with more rows scrolls with the wheel, and the arrow keys, Home and End keep the highlighted row in view. A submenu stays anchored to its row while the list is scrolled.

---

### `default`

Whatever the app chose with `setPresentation`, and the native menu when nothing was chosen.
