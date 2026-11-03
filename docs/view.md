---
id: view
title: View
---

All upstream props work as documented in the [React Native View reference](https://reactnative.dev/docs/0.87/view). This page lists only what desktop adds or changes.

## Desktop props

### `desktopDragRegion`

Marks the view as part of a custom title bar: pressing it drags the window and double-clicking zooms or maximizes it. See [Title bar](desktop-title-bar).

| Type      |
| --------- |
| `boolean` |

---

### `focusable`

Lets the view take keyboard focus. Required to receive `onKeyDown`, `onKeyUp`, `onFocus` and `onBlur`.

| Type      |
| --------- |
| `boolean` |

---

### `onFocus`, `onBlur`

The view gained or lost keyboard focus. `focusVisible` is `true` when focus arrived through the keyboard. A focused view shows a ring for keyboard users, except a `TextInput` and a view that sets its own `outlineColor` and `outlineWidth`.

| Type              |
| ----------------- |
| `(event) => void` |

---

### `onKeyDown`, `onKeyUp`

A key was pressed or released while the view has focus. The event has `key`, `code`, `keyCode`, `repeat` and the modifier flags.

| Type                        |
| --------------------------- |
| `(event: KeyEvent) => void` |

---

### `onContextMenu`

A context menu was requested: right click, Control + click on macOS, or the Menu key or Shift + F10 on Windows and Linux. See [Context menus](desktop-context-menus).

| Type                                       |
| ------------------------------------------ |
| `(event: DesktopContextMenuEvent) => void` |

---

### `onPointerDown`, `onPointerUp`, `onPointerMove`, `onPointerEnter`, `onPointerLeave`, `onPointerOver`, `onPointerOut`, `onPointerCancel`

The pointer events of the web, for the mouse and trackpad, including buttons other than the left one and hovering. Each has a capturing variant. See [Mouse and keyboard input](desktop-input).

| Type                            |
| ------------------------------- |
| `(event: PointerEvent) => void` |

---

### `tabIndex`

Includes the view in, or excludes it from, keyboard tab navigation.

| Type     |
| -------- |
| `number` |

## Differences

- On desktop a `View` with children and an `opacity` below 1 is painted into a picture of its own and faded, as on iOS and Android. `needsOffscreenAlphaCompositing` has no effect.
- `hitSlop` extends the area that starts a press. Hover and pointer moves are over the view itself, and an ancestor with `overflow: 'hidden'` clips the slop.
- Mobile-only accessibility props that name VoiceOver gestures work through the platform accessibility tree on each OS. Screen readers on Windows and Linux have not been validated.
