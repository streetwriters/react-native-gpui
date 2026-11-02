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
| `global`           | Register it with the system, so it fires with no window of the app focused. See below.                      |

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

## Global shortcuts

A shortcut with `global: true` is registered with the operating system, so it fires while no window of your app has focus. That is what a launcher or a quick-capture window needs. Register it where there is no component, such as the app's entry file:

```ts
Shortcut.register({ id: 'palette.toggle', keys: 'alt+space', global: true });
Shortcut.addHandler('palette.toggle', togglePalette);
Shortcuts.onFailure(({ id, reason }) => console.warn(id, reason));
```

A global shortcut has the same ids, key syntax, handlers and user remapping as any other, with these differences:

- It needs a modifier key, unless it is a function key, and it cannot be a chord.
- It cannot have `when` or `allowInTextInput`; registering it with either throws.
- The system may refuse the keys, because another app owns them or because the platform cannot do global shortcuts. `Shortcuts.onFailure` reports each refusal with a reason; without a listener it is logged as a warning.
- macOS and Windows support it, and Linux supports it on X11 only. Wayland has no way for an app to register one, so every global shortcut fails there.

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
