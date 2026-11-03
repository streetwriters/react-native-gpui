---
id: contextmenuview
title: ContextMenuView
---

Wraps content and opens a [context menu](desktop-context-menus) on it. A context menu opens on a right click, on Control + click on macOS, and on the Menu key or Shift + F10 on Windows and Linux.

It is a `View`, so it takes all of a view's props.

## Example

```tsx
import { ContextMenuView } from '@react-native-gpui/core/desktop';

<ContextMenuView
  items={[
    { id: 'rename', label: 'Rename' },
    { id: 'duplicate', label: 'Duplicate' },
    { type: 'separator' },
    { id: 'delete', label: 'Delete' },
  ]}
  onSelect={id => {
    if (id === 'delete') deleteFile();
  }}
>
  <FileRow file={file} />
</ContextMenuView>;
```

---

# Reference

## Props

### [View Props](https://reactnative.dev/docs/0.87/view#props)

Inherits [View Props](https://reactnative.dev/docs/0.87/view#props).

---

### `items`

The menu entries, in the same shape as the [application menu](applicationmenu#items).

| Type                                           |
| ---------------------------------------------- |
| array of [MenuItemSpec](applicationmenu#items) |

---

### `onSelect`

Called with the id of the chosen item.

| Type     |
| -------- |
| function |

---

### `onOpen`

Called after the menu is up, with the position and how it was triggered.

| Type     |
| -------- |
| function |

---

### `onDismiss`

Called when the menu closes with nothing chosen.

| Type     |
| -------- |
| function |

---

### `presentation`

How the menu is drawn. See [ContextMenu](contextmenu#presentations).

| Type                                      | Default     |
| ----------------------------------------- | ----------- |
| enum(`'default'`, `'native'`, `'custom'`) | `'default'` |

---

### `disabled`

Turns the menu off.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |
