/**
 * Tray / menu-bar apps.
 *
 * Installs a tray icon whose click opens {@link TrayPopover} — a separate RN
 * surface in a popover window — or a menu, and reports what it did.
 *
 * @format
 */

import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Tray,
  type MenuItemSpec,
  type TrayState,
} from '@react-native-gpui/core/desktop';

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

const MENU: MenuItemSpec[] = [
  { id: 'tray-open', label: 'Open' },
  { type: 'separator' },
  { id: 'tray-quit', label: 'Quit' },
];

const ICON = require('../../assets/tray-icon.png');

const ICON_MENU: MenuItemSpec[] = [
  { id: 'tray-open', label: 'Open', icon: ICON },
  {
    type: 'submenu',
    label: 'More',
    icon: ICON,
    items: [{ id: 'tray-more', label: 'Another', icon: ICON }],
  },
  { type: 'separator' },
  { id: 'tray-quit', label: 'Quit' },
];

export function TrayPopover() {
  return (
    <View style={styles.page}>
      <Text testID="tray-popover" style={styles.heading}>
        Menu-bar panel
      </Text>
      <Text style={styles.row}>This is its own RN surface.</Text>
    </View>
  );
}

function TrayFixture() {
  const [state, setState] = useState<TrayState | null>(null);
  const [lastMenu, setLastMenu] = useState('none');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setState(await Tray.getState());
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const install = useCallback(
    async (options: Parameters<typeof Tray.install>[0]) => {
      try {
        await Tray.install(options);
        await refresh();
      } catch (cause) {
        setError(String(cause));
      }
    },
    [refresh],
  );

  const setMenu = useCallback(
    async (items: MenuItemSpec[] | null) => {
      try {
        await Tray.setMenu(items);
        await refresh();
      } catch (cause) {
        setError(String(cause));
      }
    },
    [refresh],
  );

  const destroy = useCallback(async () => {
    try {
      await Tray.destroy();
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  }, [refresh]);

  React.useEffect(() => {
    const subscription = Tray.onMenuPress(id => setLastMenu(id));
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Tray</Text>
      <Text testID="tray-state" style={styles.row}>
        {state == null ? 'not installed' : JSON.stringify(state)}
      </Text>
      <Text testID="tray-menu-press" style={styles.row}>
        menu press: {lastMenu}
      </Text>
      {error ? (
        <Text testID="tray-error" style={styles.row}>
          error: {error}
        </Text>
      ) : null}
      <Pressable
        testID="tray-install-popover"
        onPress={() =>
          install({
            id: 'tester-tray',
            tooltip: 'RN GPUI tester',
            component: 'TrayPopover',
            size: { width: 320, height: 200 },
            quitOnLastWindowClosed: true,
          })
        }
      >
        <Text style={styles.button}>Install a popover tray</Text>
      </Pressable>
      <Pressable
        testID="tray-install-menu"
        onPress={() => install({ id: 'tester-tray-menu', menu: MENU })}
      >
        <Text style={styles.button}>Install a menu tray</Text>
      </Pressable>
      <Pressable
        testID="tray-install-icon"
        onPress={() =>
          install({
            id: 'tester-tray-icon',
            title: 'RN',
            icon: ICON,
            iconTemplate: true,
            menu: ICON_MENU,
          })
        }
      >
        <Text style={styles.button}>Install a tray with an icon</Text>
      </Pressable>
      <Pressable
        testID="tray-set-icon"
        onPress={async () => {
          try {
            await Tray.setIcon(ICON);
            await Tray.setTitle('GPUI');
            await refresh();
          } catch (cause) {
            setError(String(cause));
          }
        }}
      >
        <Text style={styles.button}>Set a full-colour icon and a title</Text>
      </Pressable>
      <Pressable testID="tray-set-menu" onPress={() => setMenu(MENU)}>
        <Text style={styles.button}>Set a menu</Text>
      </Pressable>
      <Pressable testID="tray-clear-menu" onPress={() => setMenu(null)}>
        <Text style={styles.button}>Clear the menu</Text>
      </Pressable>
      <Pressable testID="tray-refresh" onPress={refresh}>
        <Text style={styles.button}>Refresh the state</Text>
      </Pressable>
      <Pressable testID="tray-destroy" onPress={destroy}>
        <Text style={styles.button}>Remove the icon</Text>
      </Pressable>
    </View>
  );
}

export default TrayFixture;
