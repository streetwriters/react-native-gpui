---
id: applicationmenu
title: ApplicationMenu
---

Declares the application menu: the menu bar at the top of the screen on macOS, and a bar inside the window on Windows and Linux. An app starts with a default menu (an app menu, Edit, Window and Help), and this component replaces it.

It sets the menu when it mounts, patches single items when they change, and restores the previous menu when it unmounts. The imperative counterpart is [`Menu`](menu).

## Example

```tsx
import { ApplicationMenu } from '@react-native-gpui/core/desktop';

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

---

# Reference

## Props

### `items`

The menu. Pass `null` to go back to the default menu.

| Type                            | Required |
| ------------------------------- | -------- |
| array of [MenuItemSpec](#items) | **Yes**  |

---

### `onPress`

Called when an item is chosen, with an event that has the item's `id` and the `windowId`.

| Type     |
| -------- |
| function |

## Items

A menu is an array of `MenuItemSpec` values.

### `Item`

`{id, label, accelerator?, enabled?, checked?, role?, icon?, onPress?}`. `type: 'item'` is the default. `onPress` runs when the item is chosen, in the application menu, a context menu or a `ContextMenuView`; the menu's `onPress` prop and the `press` event are still reported with the item's `id`. The handlers are those of the array last given, so a menu rebuilt with new closures runs the new ones. `accelerator` is a key combination such as `mod+s`, where `mod` is Command on macOS and Control on Windows and Linux (see [Keyboard shortcuts](shortcuts)). A `checked` item shows a check mark instead of its icon. `icon` takes anything `<Image source>` takes, or a path string.

---

### `Submenu`

`{type: 'submenu', label, items, enabled?, icon?}`.

---

### `Separator`

`{type: 'separator'}`.

---

### `Role`

`{type: 'role', role, label?, enabled?}`. A role asks the host to perform a standard action, so you do not implement it. The label comes from the role; set `label` to override it.

### Roles

- **Edit:** `undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`
- **Window:** `minimize`, `zoom`, `toggleFullscreen`, `close`
- **App:** `about`, `services`, `hide`, `hideOthers`, `showAll`, `quit`
- **Help:** `help`
- **Whole menus:** `appMenu`, `editMenu`, `windowMenu`, `helpMenu`, a standard menu in one entry
