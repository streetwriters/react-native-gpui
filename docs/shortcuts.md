---
id: shortcuts
title: Shortcuts
---

Key bindings the app declares. The shell resolves them natively, so they work while JavaScript is busy and take precedence over a menu accelerator with the same keys. Read [Keyboard shortcuts](desktop-keyboard-shortcuts) for key syntax, scopes and global shortcuts.

Keys are written as modifiers and a key joined by `+`: `mod+s`, `shift+alt+left`. `mod` is Command on macOS and Control on Windows and Linux, so one definition covers every platform. A chord is several keystrokes separated by a space, as in `mod+k mod+s`.

## Example

```tsx
import { useShortcut } from '@react-native-gpui/core/desktop';

function Editor() {
  useShortcut('mod+s', () => save(), { description: 'Save' });
  return <TextInput multiline />;
}
```

Outside a component:

```ts
Shortcut.register({ id: 'palette.toggle', keys: 'alt+space', global: true });
Shortcut.addHandler('palette.toggle', togglePalette);
Shortcuts.onFailure(({ id, reason }) => console.warn(id, reason));
```

---

# Reference

## Methods

### `useShortcut()`

```tsx
function useShortcut(
  keys: string,
  handler: ShortcutHandler,
  options?: ShortcutOptions,
): void;
```

Registers a handler for a key combination in the nearest [`ShortcutScope`](shortcutscope), and removes it when the component unmounts. The handler is kept in a ref, so one that closes over changing state does not re-register the shortcut on every render. It receives an event with the shortcut `id`, the `keys` it fired on and its `scope`.

---

### `useShortcutScope()`

```tsx
function useShortcutScope(): string | undefined;
```

Returns the name of the nearest `ShortcutScope`.

---

### `Shortcut.register()`

```tsx
Shortcut.register(definition: {id: string; keys: string; description?: string; global?: boolean}): void;
```

Registers a shortcut under a stable id that a menu item or a user keymap can refer to. Use it where there is no component, such as the app's entry file.

---

### `Shortcut.addHandler()`

```tsx
Shortcut.addHandler(id: string, handler: ShortcutHandler): () => void;
```

Adds a handler for the shortcut with this id, and returns a function that removes it.

---

### `Shortcuts.register()`

```tsx
Shortcuts.register(definition: ShortcutDefinition): void;
```

Registers a shortcut definition. Same as `Shortcut.register`.

---

### `Shortcuts.unregister()`

```tsx
Shortcuts.unregister(id: string): void;
```

Removes a shortcut.

---

### `Shortcuts.list()`

```tsx
Shortcuts.list(): InstalledShortcut[];
```

The installed shortcuts.

---

### `Shortcuts.describe()`

```tsx
Shortcuts.describe(): ShortcutDefinition[];
```

The definitions of the shortcuts, with their descriptions.

---

### `Shortcuts.setUserBindings()`

```tsx
Shortcuts.setUserBindings(map: Record<string, string | null>): void;
```

Applies the user's keymap: an id mapped to new keys, or to `null` to unbind it.

---

### `Shortcuts.reset()`

```tsx
Shortcuts.reset(): void;
```

Removes every user binding.

---

### `Shortcuts.resolve()`

```tsx
Shortcuts.resolve(keys: string): ShortcutResolution;
```

Which shortcut owns `keys`, without pressing them.

---

### `Shortcuts.keysFor()`

```tsx
Shortcuts.keysFor(id: string): string | undefined;
```

The keys bound to an id after any remap.

---

### `Shortcuts.fire()`

```tsx
Shortcuts.fire(id: string): void;
```

Runs the handlers of a shortcut.

---

### `Shortcuts.onFailure()`

```tsx
Shortcuts.onFailure(listener: (failure: ShortcutFailure) => void): Subscription;
```

Listens for global shortcuts the system refused, with the `id` and a `reason`. Without a listener a refusal is logged as a warning.

---

## Options

The object `useShortcut` takes as its third argument.

### `when`

Register in this scope instead of the nearest one.

| Type   |
| ------ |
| string |

---

### `enabled`

Whether the shortcut is live.

| Type    | Default |
| ------- | ------- |
| boolean | `true`  |

---

### `allowInTextInput`

Whether it still fires while a text input has focus. By default typing is left to the input.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `repeat`

Whether a held key fires repeatedly. By default a save or an open runs once per press.

| Type    | Default |
| ------- | ------- |
| boolean | `false` |

---

### `description`

Text for a menu or a settings list.

| Type   |
| ------ |
| string |

---

### `global`

Register it with the system, so it fires with no window of the app focused. See [Global shortcuts](desktop-keyboard-shortcuts#global-shortcuts).

| Type    | Default |
| ------- | ------- |
| boolean | `false` |
