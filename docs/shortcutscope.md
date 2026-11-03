---
id: shortcutscope
title: ShortcutScope
---

Names part of the tree for [keyboard shortcuts](desktop-keyboard-shortcuts). A shortcut registered inside it only fires while focus is inside that scope, and an inner scope overrides an outer one.

It is a `View` that carries a name, so it takes part in layout like one.

## Example

```tsx
import { ShortcutScope, useShortcut } from '@react-native-gpui/core/desktop';

function Editor() {
  useShortcut('mod+s', save);
  return <TextInput multiline />;
}

<ShortcutScope name="editor">
  <Editor />
</ShortcutScope>;
```

---

# Reference

## Props

### [View Props](https://reactnative.dev/docs/0.87/view#props)

Inherits [View Props](https://reactnative.dev/docs/0.87/view#props).

---

### `name`

The scope's name, which a shortcut can name in its `when` option and `useShortcutScope()` returns.

| Type   | Required |
| ------ | -------- |
| string | **Yes**  |
