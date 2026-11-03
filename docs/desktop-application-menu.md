---
id: desktop-application-menu
title: Application menu
---

The application menu is the menu bar at the top of the screen on macOS, and a bar inside the window on Windows and Linux. An app starts with a default menu (an app menu, Edit, Window and Help), and you can replace it.

```tsx
import { ApplicationMenu } from '@react-native-gpui/core/desktop';
```

## Declaring a menu

`ApplicationMenu` is a component. It sets the menu when it mounts, patches single items when they change, and restores the previous menu when it unmounts.

```tsx
const items = [
  {
    type: 'submenu',
    label: 'File',
    items: [
      { id: 'file.new', label: 'New', accelerator: 'mod+n' },
      { id: 'file.open', label: 'Open…', accelerator: 'mod+o' },
      { type: 'separator' },
      { type: 'role', role: 'close' },
    ],
  },
  { type: 'role', role: 'editMenu' },
];

function App() {
  return (
    <>
      <ApplicationMenu
        items={items}
        onPress={({ id }) => {
          if (id === 'file.new') newDocument();
        }}
      />
      <Main />
    </>
  );
}
```

Pass `items={null}` to go back to the default menu.

## Menu items and roles

A menu is an array of items, submenus, separators and roles. A role asks the host to perform a standard action, such as `copy` or `quit`, so you do not implement it. The full shape, and the list of roles, are in the [`ApplicationMenu`](applicationmenu#items) reference.

## The `Menu` module

[`Menu`](menu) is the imperative counterpart of `ApplicationMenu`: it replaces the menu, patches one item, runs a role, hides the in-window bar and listens for presses.

## Windows and Linux

On Windows and Linux the menu is drawn inside the window; with a [`TitleBar`](desktop-title-bar#the-menu-bar) it sits in a row under the bar. To hide it, set `window.menuBar` to `false` in [`desktop.json`](desktop-json#window) or call `Menu.setMenuBarVisible(false)`. Accelerators keep working when the bar is hidden. On macOS the bar belongs to the system and cannot be hidden, so check `capabilities().menuBarInWindow` before showing a control for it.
