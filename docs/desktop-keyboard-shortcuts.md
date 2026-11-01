---
id: desktop-keyboard-shortcuts
title: Keyboard shortcuts
---

Shortcuts are key bindings the app declares. The shell resolves them natively, so they work while JavaScript is busy and take precedence over a menu accelerator with the same keys.

```tsx
import { useShortcut, ShortcutScope } from '@react-native-gpui/core/desktop';
```

## useShortcut

`useShortcut` registers a handler for a key combination in the nearest scope, and removes it when the component unmounts.

```tsx
function Editor() {
  useShortcut('mod+s', () => save(), { description: 'Save' });
  return <TextInput multiline />;
}
```

### Key syntax

Keys are written as modifiers and a key joined by `+`: `mod+s`, `shift+alt+left`. `mod` is Command on macOS and Control on Windows and Linux, so one definition covers every platform. A chord is several keystrokes separated by a space, as in `mod+k mod+s`. Case and the spaces around `+` do not matter.

### Options

| Option             | Description                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `when`             | Register in this scope instead of the nearest one.                                                          |
| `enabled`          | Whether the shortcut is live. Defaults to `true`.                                                           |
| `allowInTextInput` | Whether it still fires while a text input has focus. Defaults to `false`, which leaves typing to the input. |
| `repeat`           | Whether a held key fires repeatedly. Defaults to `false`, so a save or an open runs once per press.         |
| `description`      | Text for a menu or a settings list.                                                                         |

The handler is kept in a ref, so a handler that closes over changing state does not re-register the shortcut on every render. The handler receives an event with the shortcut `id`, the `keys` it fired on and its `scope`.

## Scopes

`ShortcutScope` names part of the tree. A shortcut registered inside it only fires while focus is inside that scope, and an inner scope overrides an outer one.

```tsx
<ShortcutScope name="editor">
  <Editor />
</ShortcutScope>
```

`ShortcutScope` is a `View` that carries a name, so it takes part in layout like one. `useShortcutScope()` returns the name of the nearest scope.

The order in which a key press is handled is:

1. The text input's own editing keys, unless the shortcut sets `allowInTextInput`.
2. The innermost `ShortcutScope`, then the scopes around it.
3. Shortcuts with no scope, which belong to the window.
4. Menu accelerators.

## Shortcuts outside components

`Shortcut` registers a shortcut under a stable id that a menu item or a user keymap can refer to:

```ts
Shortcut.register({ id: 'file.save', keys: 'mod+s', description: 'Save' });
const off = Shortcut.addHandler('file.save', save);
```

`Shortcuts` is the whole registry. Besides `register`, `unregister` and `addHandler` it has:

| Method                           | Description                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `Shortcuts.list()`, `describe()` | The installed shortcuts, and their definitions with descriptions.               |
| `Shortcuts.setUserBindings(map)` | Applies the user's keymap: an id mapped to new keys, or to `null` to unbind it. |
| `Shortcuts.reset()`              | Removes every user binding.                                                     |
| `Shortcuts.resolve(keys)`        | Which shortcut owns `keys`, without pressing them.                              |
| `Shortcuts.keysFor(id)`          | The keys bound to an id after any remap.                                        |
| `Shortcuts.fire(id)`             | Runs the handlers of a shortcut.                                                |
