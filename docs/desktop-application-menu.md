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

## Menu items

A menu is an array of `MenuItemSpec` values:

| Kind      | Shape                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| Item      | `{id, label, accelerator?, enabled?, checked?, role?, icon?}`. `type: 'item'` is the default. |
| Submenu   | `{type: 'submenu', label, items, enabled?, icon?}`                                            |
| Separator | `{type: 'separator'}`                                                                         |
| Role      | `{type: 'role', role, label?, enabled?}`                                                      |

- `accelerator` is a key combination such as `mod+s`. `mod` is Command on macOS and Control on Windows and Linux. See [Keyboard shortcuts](desktop-keyboard-shortcuts).
- A `checked` item shows a check mark instead of its icon.
- `icon` takes anything `<Image source>` takes, or a path string.

### Roles

A role asks the host to perform a standard action, so you do not implement it. A `role` item gets its label from the role; set `label` to override it.

| Group  | Roles                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| Edit   | `undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`                                 |
| Window | `minimize`, `zoom`, `toggleFullscreen`, `close`                                     |
| App    | `about`, `services`, `hide`, `hideOthers`, `showAll`, `quit`                        |
| Help   | `help`                                                                              |
| Menus  | `appMenu`, `editMenu`, `windowMenu`, `helpMenu`: a whole standard menu in one entry |

## The `Menu` module

`Menu` is the imperative counterpart of `ApplicationMenu`:

| Method                                       | Description                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `Menu.setApplicationMenu(items)`             | Replaces the menu. `null` restores the default.                                   |
| `Menu.update(id, {label, enabled, checked})` | Changes one item without rebuilding the menu.                                     |
| `Menu.get()`                                 | Resolves with the current menu, the app name and whether the menu bar is visible. |
| `Menu.performRole(role)`                     | Runs a standard role, for menus you draw yourself.                                |
| `Menu.setMenuBarVisible(visible, windowId?)` | Hides or shows the in-window bar.                                                 |
| `Menu.addListener('press', listener)`        | Listens for item presses. The event has the item `id` and the `windowId`.         |

## Windows and Linux

On Windows and Linux the menu is drawn inside the window; with a [`TitleBar`](desktop-title-bar#the-menu-bar) it sits in a row under the bar. To hide it, set `window.menuBar` to `false` in [`desktop.json`](desktop-json#window) or call `Menu.setMenuBarVisible(false)`. Accelerators keep working when the bar is hidden. On macOS the bar belongs to the system and cannot be hidden, so check `capabilities().menuBarInWindow` before showing a control for it.
