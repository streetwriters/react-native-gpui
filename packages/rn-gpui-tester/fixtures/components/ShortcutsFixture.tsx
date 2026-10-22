/**
 * Keyboard shortcuts.
 *
 * One screen that exercises every part of the design in one place, so the e2e
 * can press real keys against a real mounted tree — which is the only way to
 * prove that a `ShortcutScope` element contributes its context to the focus
 * path, and that a focused `TextInput` contributes `rn-text-input`. A unit test
 * that hands `bindings_for_input` a context vector cannot show that.
 *
 * The `Tester` menu is installed here as well, with an item bound to the *same*
 * keys as a scoped shortcut, so "a shortcut beats a menu accelerator" is a real
 * competition rather than an assumption.
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  Menu,
  type MenuItemSpec,
  type MenuPressEvent,
  Shortcut,
  ShortcutScope,
  Shortcuts,
  shortcutId,
  useShortcut,
} from '@react-native-gpui/core/desktop';

const styles = {
  page: { padding: 16, gap: 8, backgroundColor: '#f4f5f7', flex: 1 },
  heading: { fontSize: 20, fontWeight: '700' as const, color: '#18212f' },
  row: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
    color: '#243247',
  },
  scopeA: {
    padding: 8,
    gap: 6,
    backgroundColor: '#e8f0ff',
    borderRadius: 6,
  },
  scopeB: {
    padding: 8,
    gap: 6,
    backgroundColor: '#ffe9c7',
    borderRadius: 6,
  },
  input: {
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
    color: '#243247',
  },
  button: {
    padding: 8,
    backgroundColor: '#dce9ff',
    borderRadius: 6,
    color: '#164a9b',
  },
};

/** A counter that also records the last key that moved it. */
function useLog() {
  const [log, setLog] = useState<string[]>([]);
  const append = useCallback((entry: string) => {
    setLog(previous => [...previous.slice(-19), entry]);
  }, []);
  return { log, append };
}

/**
 * The inner scope.
 *
 * The hooks are in a separate component *inside* the `ShortcutScope`, not in the
 * component that renders it: `useShortcut` registers into the nearest scope it
 * can see through React context, and a component that renders a scope is outside
 * it. That is not a test detail — it is the rule for every caller, and getting it
 * wrong silently registers into the outer scope.
 */
function InnerBody({
  append,
  allowInTextInput,
}: {
  append: (entry: string) => void;
  allowInTextInput: boolean;
}) {
  useShortcut('mod+j', () => append('inner:mod+j'), {
    description: 'Inner scope wins',
  });
  // The same keys as a menu accelerator, to show the shortcut consumes the key
  // before the menu path ever sees it.
  useShortcut('mod+alt+k', () => append('inner:mod+alt+k'), {
    description: 'Beats the menu accelerator',
  });
  // A text input keeps `mod+a` unless the shortcut opts in.
  useShortcut('mod+a', () => append('select-all'), {
    allowInTextInput,
    description: 'Select all',
  });
  // A two-key chord: neither key alone may fire it.
  useShortcut('mod+k mod+s', () => append('chord'), {
    description: 'Chord',
  });

  const [text, setText] = useState('');

  return (
    <>
      {/* Focusable, and *not* a text input: this is what focuses the scope
          without turning it into the text-input case the next test needs. */}
      <Pressable testID="scope-inner-focus" style={styles.row} focusable>
        <Text style={styles.row}>inner scope</Text>
      </Pressable>
      <TextInput
        testID="scope-inner-input"
        style={styles.input}
        value={text}
        onChangeText={setText}
      />
    </>
  );
}

/** The inner scope: a scope element around the component that registers. */
function InnerScope({
  append,
  allowInTextInput,
}: {
  append: (entry: string) => void;
  allowInTextInput: boolean;
}) {
  return (
    <ShortcutScope name="inner" testID="scope-inner" style={styles.scopeB}>
      <InnerBody append={append} allowInTextInput={allowInTextInput} />
    </ShortcutScope>
  );
}

/** The outer scope's registrations, inside the scope it names. */
function OuterBody({
  append,
  allowInTextInput,
}: {
  append: (entry: string) => void;
  allowInTextInput: boolean;
}) {
  useShortcut('mod+j', () => append('outer:mod+j'), {
    description: 'Outer scope, overridden',
  });
  useShortcut('mod+l', () => append('outer:mod+l'));

  return (
    <>
      <Pressable testID="scope-outer-focus" style={styles.row} focusable>
        <Text style={styles.row}>outer scope</Text>
      </Pressable>
      <InnerScope append={append} allowInTextInput={allowInTextInput} />
    </>
  );
}

/** The outer scope: binds `mod+j` too, and `mod+l` which nothing overrides. */
function OuterScope({
  append,
  allowInTextInput,
}: {
  append: (entry: string) => void;
  allowInTextInput: boolean;
}) {
  return (
    <ShortcutScope name="outer" testID="scope-outer" style={styles.scopeA}>
      <OuterBody append={append} allowInTextInput={allowInTextInput} />
    </ShortcutScope>
  );
}

function ShortcutsFixture() {
  const { log, append } = useLog();
  const [allowInTextInput, setAllowInTextInput] = useState(false);
  const [menuPresses, setMenuPresses] = useState(0);
  const [userKeys, setUserKeys] = useState('');
  const [error, setError] = useState('');
  const [installed, setInstalled] = useState('');

  // The window scope: no wrapper, so this is the weakest binding and a scope
  // must be able to override it.
  useShortcut('mod+j', () => append('window:mod+j'));
  useShortcut(
    'mod+shift+p',
    // The label comes from the event, so a remap is visible in the log. A
    // hardcoded string here would make a working remap look broken.
    event => append(`window:${event.keys}`),
    { description: 'Command palette' },
  );

  // The id the hook derives for the window-scope palette shortcut, so the
  // non-hook handler below attaches to the same shortcut rather than a second
  // one that happens to share its keys.
  const paletteId = shortcutId('mod+shift+p', undefined);

  // A menu item that names the shortcut instead of a literal accelerator. Its
  // label is asked for by the test, and changes when the shortcut is remapped.
  const items = useCallback(
    (): MenuItemSpec[] => [
      {
        type: 'submenu',
        label: 'Tester',
        items: [
          {
            id: 'shortcut-increment',
            label: 'Increment',
            // The same keys as the inner scope's shortcut: the shortcut must
            // win, or this counter moves instead of the handler.
            accelerator: 'CmdOrCtrl+Alt+K',
          },
          {
            id: 'shortcut-quit',
            label: `Palette (${Shortcuts.keysFor(paletteId) ?? 'unbound'})`,
          },
        ],
      },
      { type: 'role', role: 'editMenu' },
    ],
    [paletteId],
  );

  useEffect(() => {
    Menu.setApplicationMenu(items()).catch(cause => setError(String(cause)));
  }, [items]);

  useEffect(() => {
    const subscription = Menu.addListener('press', (event: MenuPressEvent) => {
      if (event.id === 'shortcut-increment') {
        setMenuPresses(value => value + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return Shortcut.addHandler(paletteId, event => {
      append(`palette:${event.keys}`);
    });
  }, [append, paletteId]);

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Keyboard shortcuts</Text>
      <Text testID="shortcut-log">{log.join(',')}</Text>
      <Text testID="shortcut-menu-presses">{`menu:${menuPresses}`}</Text>
      <Text testID="shortcut-installed">{installed}</Text>
      <Text testID="shortcut-user-keys">{userKeys}</Text>
      {error ? <Text testID="shortcut-error">{error}</Text> : null}

      <Pressable
        testID="shortcut-toggle-allow-in-input"
        style={styles.button}
        onPress={() => setAllowInTextInput(value => !value)}
      >
        <Text style={styles.button}>
          {`allowInTextInput: ${allowInTextInput}`}
        </Text>
      </Pressable>

      <Pressable
        testID="shortcut-remap"
        style={styles.button}
        onPress={() => {
          // Remap the palette shortcut. The menu label is built from
          // `keysFor`, so a second press of the two keys is what proves the
          // remap reached the keymap as well as the label.
          Shortcuts.setUserBindings({ [paletteId]: 'mod+shift+o' });
          setUserKeys(Shortcuts.keysFor(paletteId) ?? '');
          Menu.setApplicationMenu(items()).catch(cause =>
            setError(String(cause)),
          );
        }}
      >
        <Text style={styles.button}>Remap the palette shortcut</Text>
      </Pressable>

      <Pressable
        testID="shortcut-reset"
        style={styles.button}
        onPress={() => {
          Shortcuts.reset();
          setUserKeys(Shortcuts.keysFor(paletteId) ?? '');
          Menu.setApplicationMenu(items()).catch(cause =>
            setError(String(cause)),
          );
        }}
      >
        <Text style={styles.button}>Reset the user keymap</Text>
      </Pressable>

      <Pressable
        testID="shortcut-read"
        style={styles.button}
        onPress={() => {
          // Asked from native, so this is what the keymap really holds, not
          // what the JS registry believes it installed.
          Shortcuts.install()
            .then(() => {
              const listed = Shortcuts.list();
              setInstalled(
                `installed:${listed.length};` +
                  listed
                    .map(shortcut => `${shortcut.id}@${shortcut.keys}`)
                    .sort()
                    .join('|'),
              );
            })
            .catch(cause => setError(String(cause)));
        }}
      >
        <Text style={styles.button}>Report the installed shortcuts</Text>
      </Pressable>

      <OuterScope append={append} allowInTextInput={allowInTextInput} />
    </View>
  );
}

export default ShortcutsFixture;
