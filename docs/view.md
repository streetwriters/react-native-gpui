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

### `hoverStyle`, `activeStyle`, `focusStyle`, `focusVisibleStyle`

Style that applies while the view is hovered, pressed, focused, or focused after keyboard input. The state is resolved while painting, in native code, so a hover or press repaints without a round trip to JavaScript and without React rendering. See [State styles](#state-styles).

| Type                           |
| ------------------------------ |
| `StyleProp<DesktopStateStyle>` |

---

### `group`

Names the view as a group. Descendants style against it with `groupHoverStyle` and `groupActiveStyle`.

| Type     |
| -------- |
| `string` |

---

### `groupHoverStyle`, `groupActiveStyle`

Style that applies while the ancestor that set `group` to the given name is hovered, or pressed. See [State styles](#state-styles).

| Type                                                     |
| -------------------------------------------------------- |
| `{ group: string, style: StyleProp<DesktopStateStyle> }` |

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

## State styles

`hoverStyle`, `activeStyle`, `focusStyle`, `focusVisibleStyle`, `groupHoverStyle` and `groupActiveStyle` change how a view is painted while it is in a state. A state change repaints in native code only: nothing is sent to JavaScript and React does not render.

```jsx
<View
  style={{ backgroundColor: '#fff' }}
  hoverStyle={{ backgroundColor: '#eee' }}
  activeStyle={{ backgroundColor: '#ddd' }}
/>
```

### Supported style properties

A state style can change `backgroundColor`, `opacity`, `boxShadow`, `borderColor` and the per-side `borderLeftColor`, `borderTopColor`, `borderRightColor` and `borderBottomColor`, `transform` and `color`. Colors must be plain colors, not `PlatformColor` or `DynamicColorIOS`. Any other property is ignored, with a warning in development. A style may be an array, as with `style`.

- `borderColor` changes the color of borders the view already has. It does not add a border or change its width.
- `transform` takes translate, scale, rotate, skew and matrix. It replaces the view's own transform while the state holds, and an animated transform wins over it.
- `color` sets the color of all text inside the view, replacing the colors the text sets itself. A `color` on a `Text` colors that text and the text nested in it.

### States

| Prop                | Applies while                                                                         |
| ------------------- | ------------------------------------------------------------------------------------- |
| `hoverStyle`        | the pointer is over the view, or over one of its descendants                          |
| `activeStyle`       | the primary button pressed on the view or a descendant is held, even if it moves away |
| `focusStyle`        | the view has keyboard focus                                                           |
| `focusVisibleStyle` | the view has keyboard focus and the last input was the keyboard                       |
| `groupHoverStyle`   | the pointer is over the group's view, or over one of its descendants                  |
| `groupActiveStyle`  | the primary button pressed on the group's view or a descendant is held                |

When several apply, the later one in this order wins for a property they share: focus, focus visible, group hover, hover, group active, active.

`focusStyle` and `focusVisibleStyle` need a view that can take focus: set `focusable`, or use a `TextInput`.

A view with `pointerEvents` set to `none` or `box-none` ignores `hoverStyle` and `activeStyle`, as it is not a pointer target.

Hover follows the same path as `onPointerEnter` and `onPointerLeave`. It is worked out again after the tree changes, so a view that mounts under a still pointer is hovered, and so are the group styles of a child that mounts inside a hovered group.

### Groups

A group lets a child react to an ancestor. The ancestor sets `group` to a name, and the child names that group in `groupHoverStyle` or `groupActiveStyle`.

```jsx
<View group="row" style={{ flexDirection: 'row' }}>
  <Text>Name</Text>
  <View
    style={{ opacity: 0 }}
    groupHoverStyle={{ group: 'row', style: { opacity: 1 } }}
  />
</View>
```

The group is the nearest ancestor that sets that name, so rows of a list can all use `"row"` and hovering one row does not change the others. A child can follow any ancestor by its name, not only its parent. A view follows one group for hover and one for press.

### How states are resolved

The pointer states come from the path React Native already tracks for `onPointerEnter` and `onPointerLeave`: the view under the pointer and its ancestors. They are resolved when the view renders, in native code, rather than by gpui's own hover and pressed styles on the view's element. Those listen on the element itself, which a press that a child handled never reaches, and a group they look up by name is missing when a child is drawn apart from its parent. Focus is read from the focus state the view reports.

### Animations

An animated value wins over a state style. While a native-driven animation owns a property of a view, such as `opacity` or `backgroundColor`, its state styles leave that property out and keep applying the rest.

A state style's `opacity` applies to the view and everything inside it, per shape, not to the view's content as one picture.
