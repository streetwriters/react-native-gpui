---
id: windowcontrol
title: WindowControl
---

A single caption button: minimize, maximize or close. Use it to build a title bar with your own look. It carries its own hover and pressed state and runs the action itself.

## Example

```tsx
import { WindowControl } from '@react-native-gpui/core/desktop';

<WindowControl
  action="close"
  style={({ hovered }) => ({
    width: 46,
    height: 32,
    backgroundColor: hovered ? '#e81123' : 'transparent',
  })}
>
  {({ hovered }) => <CloseGlyph color={hovered ? 'white' : 'black'} />}
</WindowControl>;
```

---

# Reference

## Props

### `action`

What the button does.

| Type                                        | Required |
| ------------------------------------------- | -------- |
| enum(`'minimize'`, `'maximize'`, `'close'`) | **Yes**  |

---

### `style`

Styles, or a function of the button's state. The state drives appearance only and never decides whether the action runs.

| Type                                          |
| --------------------------------------------- |
| [View Style](view-style-props.md) or function |

---

### `children`

The glyph. A function of the button's state, so the maximize glyph can switch to a restore glyph.

| Type             |
| ---------------- |
| node or function |

---

### `disabled`

Turns the button off.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `testID`

Used to find the button in tests.

| Type   |
| ------ |
| string |

---

## State

The state passed to `style` and `children` has three fields:

### `hovered`

Whether the pointer is over the button.

---

### `pressed`

Whether the button is being pressed.

---

### `maximized`

Whether the window is maximized.
