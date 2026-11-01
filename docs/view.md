---
id: view
title: View
---

All upstream props work as documented in the [React Native View reference](https://reactnative.dev/docs/0.87/view). This page lists only what desktop adds or changes.

## Desktop props

| Name                                                                                                                                    | Type                                       | Behaviour                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktopDragRegion`                                                                                                                     | `boolean`                                  | Marks the view as part of a custom title bar: pressing it drags the window and double-clicking zooms or maximizes it. See [Title bar](desktop-title-bar).                                       |
| `focusable`                                                                                                                             | `boolean`                                  | Lets the view take keyboard focus. Required to receive `onKeyDown`, `onKeyUp`, `onFocus` and `onBlur`.                                                                                          |
| `onFocus`, `onBlur`                                                                                                                     | `(event) => void`                          | The view gained or lost keyboard focus. `focusVisible` is `true` when focus arrived through the keyboard.                                                                                       |
| `onKeyDown`, `onKeyUp`                                                                                                                  | `(event: KeyEvent) => void`                | A key was pressed or released while the view has focus. The event has `key`, `code`, `keyCode`, `repeat` and the modifier flags.                                                                |
| `onContextMenu`                                                                                                                         | `(event: DesktopContextMenuEvent) => void` | A context menu was requested: right click, Control + click on macOS, or the Menu key or Shift + F10 on Windows and Linux. See [Context menus](desktop-context-menus).                           |
| `onPointerDown`, `onPointerUp`, `onPointerMove`, `onPointerEnter`, `onPointerLeave`, `onPointerOver`, `onPointerOut`, `onPointerCancel` | `(event: PointerEvent) => void`            | The pointer events of the web, for the mouse and trackpad, including buttons other than the left one and hovering. Each has a capturing variant. See [Mouse and keyboard input](desktop-input). |
| `tabIndex`                                                                                                                              | `number`                                   | Includes the view in, or excludes it from, keyboard tab navigation.                                                                                                                             |

## Differences

- On desktop a `View` with children and an `opacity` below 1 is painted into a picture of its own and faded, as on iOS and Android. `needsOffscreenAlphaCompositing` has no effect.
- `hitSlop` extends the area that starts a press. Hover and pointer moves are over the view itself, and an ancestor with `overflow: 'hidden'` clips the slop.
- Mobile-only accessibility props that name VoiceOver gestures work through the platform accessibility tree on each OS. Screen readers on Windows and Linux have not been validated.
