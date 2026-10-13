/**
 * Application menu.
 *
 * Sets a menu with a Tester submenu: an item bound to CmdOrCtrl+Shift+K that
 * increments a counter, a checkable item whose state round-trips, and a disabled
 * item. It also exercises `Menu.update` and the default menu after a reset.
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  Menu,
  type MenuItemSpec,
  type MenuPressEvent,
} from 'react-native-gpui/desktop';

const styles = {
  page: { padding: 20, gap: 10, backgroundColor: '#f4f5f7', flex: 1 },
  heading: { fontSize: 22, fontWeight: '700' as const, color: '#18212f' },
  row: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    color: '#243247',
  },
  button: {
    padding: 10,
    backgroundColor: '#dce9ff',
    borderRadius: 8,
    color: '#164a9b',
  },
};

function DesktopMenuFixture() {
  const [count, setCount] = useState(0);
  const [checked, setChecked] = useState(false);
  const [lastPress, setLastPress] = useState('none');
  const [error, setError] = useState('');

  const items = useCallback(
    (): MenuItemSpec[] => [
      {
        type: 'submenu',
        label: 'Tester',
        items: [
          {
            id: 'tester-increment',
            label: 'Increment',
            accelerator: 'CmdOrCtrl+Shift+K',
          },
          {
            id: 'tester-check',
            label: 'Checkable',
            checked,
          },
          {
            // Checked *and* disabled: the two flags used to collide, because a
            // checked item was built as a muda `CheckMenuItem` with `enabled`
            // hardcoded true, so this one stayed clickable whatever the model
            // said. A test asserts it is reported disabled on Windows.
            id: 'tester-check-disabled',
            label: 'Checkable Disabled',
            checked: true,
            enabled: false,
          },
          { type: 'separator' },
          {
            id: 'tester-disabled',
            label: 'Disabled',
            enabled: false,
          },
        ],
      },
      { type: 'role', role: 'editMenu' },
      { type: 'role', role: 'windowMenu' },
    ],
    [checked],
  );

  useEffect(() => {
    Menu.setApplicationMenu(items()).catch(cause => {
      setError(String(cause));
    });
  }, [items]);

  useEffect(() => {
    const subscription = Menu.addListener('press', (event: MenuPressEvent) => {
      setLastPress(`${event.id}@${event.windowId}`);
      if (event.id === 'tester-increment') {
        setCount(value => value + 1);
      } else if (event.id === 'tester-check') {
        setChecked(value => !value);
      }
    });
    return () => subscription.remove();
  }, []);

  const [menuJson, setMenuJson] = useState('');
  const [copySource, setCopySource] = useState('');
  const [pasteTarget, setPasteTarget] = useState('');

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Application menu</Text>
      <Text testID="desktop-menu-count" style={styles.row}>
        increments: {count}
      </Text>
      <Text testID="desktop-menu-checked" style={styles.row}>
        checked: {String(checked)}
      </Text>
      <Text testID="desktop-menu-last-press" style={styles.row}>
        last press: {lastPress}
      </Text>
      <Text testID="desktop-menu-json" style={styles.row}>
        {menuJson}
      </Text>
      {error ? (
        <Text testID="desktop-menu-error" style={styles.row}>
          error: {error}
        </Text>
      ) : null}
      <Pressable
        testID="desktop-menu-read"
        onPress={() => {
          Menu.get()
            .then(description => setMenuJson(JSON.stringify(description)))
            .catch(cause => setError(String(cause)));
        }}
      >
        <Text style={styles.button}>Read the menu back</Text>
      </Pressable>
      <Pressable
        testID="desktop-menu-update-check"
        onPress={() => {
          setChecked(value => !value);
          // "Reset to the default menu" removes the tester's items, so an update
          // after that rejects with `not_found`. Put the menu back first, and
          // report anything that still fails instead of leaving an unhandled
          // rejection to LogBox.
          Menu.update('tester-check', { checked: !checked })
            .catch(() =>
              Menu.setApplicationMenu(items()).then(() =>
                Menu.update('tester-check', { checked: !checked }),
              ),
            )
            .catch(cause => setError(String(cause)));
        }}
      >
        <Text style={styles.button}>Toggle checked via update</Text>
      </Pressable>
      <Pressable
        testID="desktop-menu-reset"
        onPress={() => {
          setError('');
          Menu.setApplicationMenu(null).catch(cause => setError(String(cause)));
        }}
      >
        <Text style={styles.button}>Reset to the default menu</Text>
      </Pressable>
      <Text style={styles.row}>
        Edit roles (Cmd/Ctrl+A/C/V) act on the focused input:
      </Text>
      <TextInput
        testID="menu-copy-source"
        style={styles.row}
        value={copySource}
        onChangeText={setCopySource}
      />
      <TextInput
        testID="menu-paste-target"
        style={styles.row}
        value={pasteTarget}
        onChangeText={setPasteTarget}
      />
    </View>
  );
}

export default DesktopMenuFixture;
