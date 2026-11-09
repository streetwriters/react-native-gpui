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

### `tooltip`

Text shown in a tooltip after the pointer has rested over the view, as the web's `title` attribute does. It is a desktop extension that follows react-native-macos's prop of the same name.

```jsx
<View tooltip="Create a note" />
```

The view under the pointer, or its nearest ancestor with a `tooltip`, is the one that counts, so a button's children share the button's tooltip. The tooltip hides when the pointer leaves the view, a button is pressed, the content scrolls or the window loses focus, shows the new text when `tooltip` changes, and never takes focus. It is also the view's accessibility description when it has no `accessibilityHint`, and the view then appears in the accessibility tree as a group. A view with no `tooltip` shows nothing; an empty string removes it.

On macOS the system draws it, so the delay, the look and the placement are the system's, and it can extend outside the window. On Windows and Linux the app draws it in front of the window's content after half a second, in a plain style, and it stays inside the window; the system tooltip control of those platforms is not used yet. Set `RN_GPUI_TOOLTIP=drawn` to use the drawn tooltip on macOS too, for example to capture one in a test.

It is placed at the view's frame with the window's [zoom factor](desktopwindow#setzoomfactor) applied.

| Type   |
| ------ |
| string |

---

### `acceptsFiles`

Whether the view takes files and folders dragged in from the operating system. The nearest view under the pointer that does, counting the view itself, receives the drag events below; a view with none of them in its path is not a drop target and nothing is sent. See [Files dropped from the system](#files-dropped-from-the-system).

| Type      |
| --------- |
| `boolean` |

---

### `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`

Files dragged in from the operating system came over the view, moved over it, left it, or were dropped on it. `event.nativeEvent` has `files`, `x` and `y` (the pointer in the view), `pageX` and `pageY`, and `target`. Each file has `path`, `name`, `size` in bytes (`0` for a folder), `type` (a media type from the extension, or `''`) and `isDirectory`. The `Capture` forms exist too.

| Type                                |
| ----------------------------------- |
| `(event: DesktopDragEvent) => void` |

---

### `dragOverStyle`

State style applied while files are dragged over the view, which must set `acceptsFiles`. See [State styles](#state-styles).

| Type                           |
| ------------------------------ |
| `StyleProp<DesktopStateStyle>` |

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

A key was pressed or released while the view has focus. The event has `key`, `code`, `keyCode`, `repeat` and the modifier flags. It goes to the focused view once and bubbles to its ancestors, as on other platforms.

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

A press captures the pointer. From `onPointerDown` until the button is released, `onPointerMove` and `onPointerUp` go to the view that was pressed, and bubble to its ancestors, wherever the pointer is, including outside the view and the window. Other views get no pointer moves meanwhile. There is nothing to call: a splitter or a slider needs only these handlers.

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
- `hitSlop` extends the area that takes a press, a pointer move or hover (`onPointerEnter`, `onPointerLeave`), and shows the view's `cursor`. An ancestor with `overflow: 'hidden'` clips the slop. State styles (`hoverStyle`) still follow the painted box. To paint a 1 point divider that can be grabbed over 5 points, give it `hitSlop={2}` and `cursor: 'col-resize'`.
- `overflow: 'hidden'` with a `borderRadius` clips children to the rounded shape, also under a `transform`. A rotated view clips to its bounding box without the rounded corners. A rounded `Image` under a scale clips to the unscaled shape for now.
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

A state style can change `backgroundColor`, `opacity`, `boxShadow`, `borderColor` and the per-side `borderLeftColor`, `borderTopColor`, `borderRightColor` and `borderBottomColor`, `transform`, `color`, `outlineColor`, `outlineWidth` and `outlineOffset`. Colors must be plain colors, not `PlatformColor` or `DynamicColorIOS`. Any other property is ignored, with a warning in development. A style may be an array, as with `style`.

- `borderColor` changes the color of borders the view already has. It does not add a border or change its width.
- The outline properties draw a ring such as a keyboard focus ring: `outlineColor` with `outlineWidth` and `outlineOffset` replace the view's own. A view that sets an outline does not get the default focus ring.
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

## Files dropped from the system

```jsx
<View
  acceptsFiles
  dragOverStyle={{ backgroundColor: '#dbeafe' }}
  onDrop={event => {
    for (const file of event.nativeEvent.files) {
      importAttachment(file.path);
    }
  }}
/>
```

Dragging files over the window sends `onDragEnter` to the view that takes them, `onDragOver` as the pointer moves, and `onDragLeave` when it moves to another view, leaves the window or is cancelled. Dropping sends `onDrop`, and no leave. A view that does not set `acceptsFiles` is never the target: the nearest ancestor that does is, and when there is none a drop does nothing. The event is a bubbling event, so a handler on an ancestor of the target also runs.

`path` is a path the app can read, so a file is read from disk, not delivered as bytes. The drop does not copy or open anything. Dragging files out of the app is not supported.

## Dragging views inside the app

```jsx
<View draggable onDragStart={() => DragDrop.setPayload({ id: note.id })} />
<View
  droppable
  dragOverStyle={{ backgroundColor: '#dbeafe' }}
  onDrop={() => move(DragDrop.getPayload().id)}
/>
```

A press on a `draggable` view that moves 4 points starts a drag: the press is cancelled, so a `Pressable` around it does not fire, and the view gets `onDragStart`. The drag follows the pointer wherever it goes, also out of the view and over a scroll view. The nearest `droppable` view under it gets `onDragEnter`, `onDragOver` and `onDragLeave`, and the release sends it `onDrop` with no leave. The source gets `onDrag` as the pointer moves and `onDragEnd` at the end, with `dropped` saying whether a droppable view took it. See [Dragging views](desktop-drag-and-drop) for the payload, the preview and auto-scrolling.

## Borders

Borders follow React Native: `borderWidth` and `borderColor` set all four sides, and `borderTopWidth`, `borderRightWidth`, `borderBottomWidth`, `borderLeftWidth` and the matching `...Color` props set one side with its own width and color. A side with a width and a color paints, also when no other side does and under a `borderRadius`. `borderStyle` is `solid`, `dashed` or `dotted`. A width under one device pixel, such as `StyleSheet.hairlineWidth` on a 1x display, may not show.

## Modifier keys on presses

The `nativeEvent` of a press, such as the one `onPress` of a `Pressable` and the responder events give, also has `shiftKey`, `ctrlKey`, `altKey` and `metaKey`, the keys held at the release. It is a desktop extension to React Native's press event, and the fields are absent on other platforms. The type of `onPress` does not list them, so read them with a cast.
