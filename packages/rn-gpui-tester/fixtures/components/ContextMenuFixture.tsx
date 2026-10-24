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
  nested: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#e8edf5',
    borderRadius: 6,
  },
};

const ITEMS: MenuItemSpec[] = [
  { id: 'cm-open', label: 'Open', icon: require('../../assets/tray-icon.png') },
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
  const [pointer, setPointer] = useState('none');
  const [pointerLog, setPointerLog] = useState<Array<string>>([]);
  // What JS was told, so a test can tell 'native opened it' from 'JS did'.
  const [events, setEvents] = useState('');

  // Which button, the mask of held buttons, and the modifiers — the fields
  // section 2 added. Logged for every press so the e2e can assert them.
  const recordPointer = useCallback(
    (phase: string) =>
      (event: {
        nativeEvent: {
          button: number;
          buttons: number;
          ctrlKey: boolean;
          shiftKey: boolean;
          altKey: boolean;
          metaKey: boolean;
        };
      }) => {
        const n = event.nativeEvent;
        const line = `${phase} button=${n.button} mask=${n.buttons} mods=${
          [
            n.ctrlKey && 'ctrl',
            n.shiftKey && 'shift',
            n.altKey && 'alt',
            n.metaKey && 'meta',
          ]
            .filter(Boolean)
            .join('+') || 'none'
        }`;
        setPointer(line);
        // Accumulated, so a test can see the press even after the release has
        // replaced the last line.
        setPointerLog(previous => [...previous, line]);
      },
    [],
  );

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
        testID="pointer-probe"
        style={styles.row}
        pointerEvents="auto"
        onPointerDown={recordPointer('down')}
        onPointerUp={recordPointer('up')}
      >
        <Text testID="pointer-log">pointer {pointer}</Text>
        <Text testID="pointer-history">{pointerLog.join(' | ')}</Text>
      </View>
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
        {/* The regression this guards: a child that takes pointer input must not
            swallow the press before the parent's context menu sees it. Both have
            to happen — the pointer event for the child, the menu for the parent. */}
        <View
          testID="cm-nested-pointer"
          style={styles.nested}
          onPointerDown={recordPointer('nested-down')}
        >
          <Text>Right-click me (nested, with onPointerDown)</Text>
        </View>
      </View>
      <ContextMenuView
        testID="cm-view"
        items={ITEMS}
        onPress={id => {
          setChosen(`view:${id}`);
          setEvents(previous => `${previous}|select:${id}`);
        }}
        onSelect={id => setEvents(previous => `${previous}|selected:${id}`)}
        onOpen={() => setEvents(previous => `${previous}|open`)}
        onContextMenu={() => setEvents(previous => `${previous}|contextMenu`)}
        style={styles.row}
      >
        <Text>Right-click me (ContextMenuView)</Text>
      </ContextMenuView>
      <ContextMenuView
        testID="cm-view-disabled"
        items={[{ id: 'cm-should-not-open', label: 'Disabled, must not open' }]}
        disabled
        onContextMenu={() =>
          setEvents(previous => `${previous}|disabled-contextMenu`)
        }
        style={styles.row}
      >
        <Text>Right-click me (ContextMenuView, disabled)</Text>
      </ContextMenuView>
      {/* Two native targets, one inside the other: the inner must win. */}
      <ContextMenuView
        testID="cm-view-outer"
        items={[{ id: 'cm-outer', label: 'Outer' }]}
        style={styles.row}
      >
        <ContextMenuView
          testID="cm-view-inner"
          items={[{ id: 'cm-inner', label: 'Inner' }]}
          style={styles.nested}
        >
          <Text>Right-click me (nested ContextMenuView)</Text>
        </ContextMenuView>
      </ContextMenuView>
      <Text testID="cm-log" style={styles.row}>
        events: {events}
      </Text>
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
