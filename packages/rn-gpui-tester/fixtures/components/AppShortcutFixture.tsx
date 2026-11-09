/**
 * A shortcut with no scope on the keys of a default menu accelerator, registered
 * the way an app registers one: outside any component.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Shortcut } from '@react-native-gpui/core/desktop';

Shortcut.register({ id: 'fixture.close-tab', keys: 'mod+w' });

export default function AppShortcutFixture() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(
    () =>
      Shortcut.addHandler('fixture.close-tab', () =>
        setLog(previous => [...previous, 'close-tab']),
      ),
    [],
  );
  return (
    <View style={{ padding: 16 }}>
      <Text testID="app-shortcut-log">{log.join(' ')}</Text>
      <View
        testID="app-shortcut-focus"
        focusable
        style={{ width: 100, height: 30, backgroundColor: '#ddd' }}
      />
    </View>
  );
}
