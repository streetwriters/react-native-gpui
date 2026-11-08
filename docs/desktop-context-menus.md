---
id: desktop-context-menus
title: Context menus
---

A context menu opens on a right click, on Control + click on macOS, and on the Menu key or Shift + F10 on Windows and Linux.

```tsx
import { ContextMenuView } from '@react-native-gpui/core/desktop';
```

## ContextMenuView

`ContextMenuView` wraps content and opens a menu on it:

```tsx
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
</ContextMenuView>
```

`items` use the same shape as the [application menu](applicationmenu#items). It is a `View`, so it takes all of a view's props. The props it adds are in the [`ContextMenuView`](contextmenuview) reference.

## ContextMenu.show

`ContextMenu.show` opens a menu from code and resolves with the chosen id, or `null` when it was dismissed:

```tsx
const id = await ContextMenu.show(items, { x: 120, y: 80 });
```

An item's `onPress` runs before the promise resolves, so a nested menu can carry its own callbacks:

```tsx
await ContextMenu.show(
  [
    { id: 'rename', label: 'Rename', onPress: () => rename() },
    {
      type: 'submenu',
      label: 'Move to',
      items: [{ id: 'trash', label: 'Trash', onPress: () => trash() }],
    },
  ],
  { x: 120, y: 80 },
);
```

The options and the rest of the API are in the [`ContextMenu`](contextmenu) reference.

## Presentations

A menu is `'native'` (the platform's own, which opens without JavaScript), `'custom'` (drawn by React in the window, the same on every platform and themeable) or `'default'` (whatever the app chose with `ContextMenu.setPresentation`, and native when nothing was chosen). `ContextMenu.setTheme` and `ContextMenu.setRenderers` set the colours of the custom menu and its building blocks.

## Handling the event yourself

Any `View` takes `onContextMenu` (and `onContextMenuCapture`) when you want to react to the request without a menu:

```tsx
<View
  onContextMenu={event => {
    const { x, y, button, trigger } = event.nativeEvent;
  }}
/>
```

The event carries `x`, `y` in window coordinates, `pageX`, `pageY`, the `windowId`, the `button`, the modifier keys (`ctrlKey`, `shiftKey`, `altKey`, `metaKey`), and `trigger`, which is `'mouse'` or `'keyboard'`. A keyboard trigger only exists on Windows and Linux, and the menu is then anchored at the view's corner.

`button` uses the W3C numbering: 0 is left, 1 is middle, 2 is right, 3 is back and 4 is forward. A keyboard trigger reports 0.
