/**
 * Native context menus.
 *
 * Exercises the imperative `ContextMenu.show`, the `onContextMenu` View prop,
 * the `ContextMenuView` wrapper and the `@react-native-menu/menu` polyfill.
 *
 * @format
 */

import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { ContextMenu, ContextMenuView } from '@react-native-gpui/core/desktop';
import type { MenuItemSpec } from '@react-native-gpui/core/desktop';
import { MenuView } from '@react-native-gpui/core/polyfills/menu';

const styles = {
  page: { padding: 20, gap: 10, backgroundColor: '#f4f5f7', flex: 1 },
  heading: { fontSize: 22, fontWeight: '700' as const, color: '#18212f' },
  row: {
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 8,
    color: '#243247',
  },
};

const ITEMS: MenuItemSpec[] = [
  { id: 'cm-open', label: 'Open' },
  {
    type: 'submenu',
    label: 'More',
    items: [
      { id: 'cm-nested', label: 'Nested item' },
      { id: 'cm-nested-two', label: 'Another nested item' },
    ],
  },
  { type: 'separator' },
  { id: 'cm-check', label: 'Checked item', checked: true },
  { id: 'cm-disabled', label: 'Disabled item', enabled: false },
];

function ContextMenuFixture() {
  const [chosen, setChosen] = useState('none');
  const [error, setError] = useState('');

  const report = useCallback((id: string | null) => {
    setChosen(id ?? 'dismissed');
  }, []);

  const showAt = useCallback(
    (x: number, y: number, windowId?: number) => {
      ContextMenu.show(ITEMS, { x, y, windowId })
        .then(report)
        .catch(cause => {
          setError(String(cause));
        });
    },
    [report],
  );

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Context menus</Text>
      <View
        testID="cm-target"
        style={styles.row}
        onContextMenu={event =>
          showAt(
            event.nativeEvent.x,
            event.nativeEvent.y,
            event.nativeEvent.windowId,
          )
        }
      >
        <Text>Right-click me (onContextMenu)</Text>
      </View>
      <ContextMenuView
        testID="cm-view"
        items={ITEMS}
        onPress={id => setChosen(`view:${id}`)}
        style={styles.row}
      >
        <Text>Right-click me (ContextMenuView)</Text>
      </ContextMenuView>
      <MenuView
        testID="cm-polyfill"
        actions={[
          { id: 'poly-open', title: 'Poly Open' },
          {
            id: 'poly-sub',
            title: 'Poly Sub',
            subactions: [{ id: 'poly-nested', title: 'Poly nested' }],
          },
          { id: 'poly-hidden', title: 'Hidden', attributes: { hidden: true } },
          {
            id: 'poly-off',
            title: 'Poly disabled',
            attributes: { disabled: true },
          },
        ]}
        onPressAction={event => setChosen(`poly:${event.nativeEvent.event}`)}
      >
        <Text>Right-click me (@react-native-menu/menu polyfill)</Text>
      </MenuView>
      <Text testID="cm-chosen" style={styles.row}>
        chosen: {chosen}
      </Text>
      {error ? (
        <Text testID="cm-error" style={styles.row}>
          error: {error}
        </Text>
      ) : null}
    </View>
  );
}

export default ContextMenuFixture;
