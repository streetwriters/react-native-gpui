---
id: menu
title: Menu
---

The imperative counterpart of the [`ApplicationMenu`](applicationmenu) component: set, patch and read the application menu from code.

On macOS the menu is the menu bar at the top of the screen. On Windows it is a native menu, and on Linux a bar drawn inside the window, which a [`TitleBar`](titlebar) keeps in a row under the bar. To hide the in-window bar set `window.menuBar` to `false` in [`desktop.json`](desktop-json#menubar) or call `setMenuBarVisible(false)`.

## Example

```tsx
import { Menu } from '@react-native-gpui/core/desktop';

await Menu.setApplicationMenu([
  { type: 'submenu', label: 'File', items: [{ id: 'file.new', label: 'New' }] },
  { type: 'role', role: 'editMenu' },
]);

const subscription = Menu.addListener('press', ({ id }) => {
  if (id === 'file.new') newDocument();
});
```

---

# Reference

## Methods

### `setApplicationMenu()`

```tsx
Menu.setApplicationMenu(items: MenuItemSpec[] | null): Promise<void>;
```

Replaces the menu. `null` restores the default.

---

### `setDockMenu()`

```tsx
Menu.setDockMenu(items: MenuItemSpec[] | null): Promise<void>;
```

Sets the menu shown above the system's own items when the app's Dock icon is right-clicked, such as "New note" and "New notebook". macOS only: elsewhere the call does nothing, and Windows has no equivalent yet. `null` removes the menu.

An item's `onPress` runs when it is chosen, and the press is also reported to `Menu.addListener('press')` with the item's `id`. Ids should differ from the application menu's. The menu is cleared when the app quits; set it again on every launch.

---

### `update()`

```tsx
Menu.update(id: string, patch: MenuItemPatch): Promise<void>;
```

Changes one item without rebuilding the menu.

---

### `get()`

```tsx
Menu.get(): Promise<MenuDescription>;
```

Resolves with the current menu, the app name and whether the menu bar is visible.

---

### `performRole()`

```tsx
Menu.performRole(role: MenuRole): Promise<void>;
```

Runs a standard [role](applicationmenu#roles), for menus you draw yourself.

---

### `setMenuBarVisible()`

```tsx
Menu.setMenuBarVisible(visible: boolean, windowId?: number): Promise<void>;
```

Hides or shows the in-window bar. It is a no-op on macOS, where the bar is the system's; check `capabilities().menuBarInWindow`. Accelerators keep working while it is hidden.

---

### `setMenuBarSlot()`

```tsx
Menu.setMenuBarSlot(
  slot: {x: number; y: number; width: number; height: number},
  colors: {foreground: number; hover: number},
  windowId?: number,
): Promise<void>;
```

Linux. Reserves a row of your own tree for the in-window menu bar, so a custom title bar can keep the menu where it belongs. `TitleBar` does this itself.

---

### `clearMenuBarSlot()`

```tsx
Menu.clearMenuBarSlot(windowId?: number): Promise<void>;
```

Linux. Gives the reserved row back.

---

### `addListener()`

```tsx
Menu.addListener(event: 'press', listener: (event: MenuPressEvent) => void): Subscription;
```

Listens for item presses. The event has the item `id` and the `windowId`. Returns a subscription to remove.
