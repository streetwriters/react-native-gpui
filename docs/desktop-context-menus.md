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

`items` use the same shape as the [application menu](desktop-application-menu#menu-items). It is a `View`, so it takes all of a view's props, and it adds:

| Prop           | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `items`        | The menu entries.                                                        |
| `onSelect`     | Called with the id of the chosen item.                                   |
| `onOpen`       | Called after the menu is up, with the position and how it was triggered. |
| `onDismiss`    | Called when the menu closes with nothing chosen.                         |
| `presentation` | `'default'`, `'native'` or `'custom'`. See below.                        |
| `disabled`     | Turns the menu off.                                                      |

## ContextMenu.show

`ContextMenu.show` opens a menu from code and resolves with the chosen id, or `null` when it was dismissed:

```tsx
const id = await ContextMenu.show(items, { x: 120, y: 80 });
```

The options are `x`, `y` (window coordinates), `windowId` and `presentation`.

## Presentations

| Presentation | Description                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `'native'`   | The platform's own menu. It opens without JavaScript, so it works while JavaScript is busy.             |
| `'custom'`   | A menu drawn by React in the window, which looks the same on every platform and can be themed.          |
| `'default'`  | Whatever the app chose with `ContextMenu.setPresentation`, and the native menu when nothing was chosen. |

`ContextMenu.setPresentation`, `ContextMenu.setTheme` and `ContextMenu.setRenderers` set the app-wide presentation, the colors of the custom menu, and its building blocks. A replacement renderer only draws: placement, keyboard handling and dismissal stay with the host.

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
