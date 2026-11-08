/**
 * The App module: launch arguments and the arguments of a second launch.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { App, Menu, useWindowState } from '@react-native-gpui/core/desktop';

export default function AppFixture() {
  const zoom = useWindowState()?.zoomFactor ?? 0;
  const [dockPresses, setDockPresses] = useState<string[]>([]);
  const [seconds, setSeconds] = useState<string[]>([]);
  useEffect(() => {
    const subscription = App.onSecondInstance(args =>
      setSeconds(previous => [...previous, args.join(' ')]),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    Menu.setDockMenu([
      {
        id: 'dock-new-note',
        label: 'New note',
        onPress: () => setDockPresses(previous => [...previous, 'note']),
      },
      {
        id: 'dock-new-notebook',
        label: 'New notebook',
        onPress: () => setDockPresses(previous => [...previous, 'notebook']),
      },
    ]).catch(() => undefined);
    return () => {
      Menu.setDockMenu(null).catch(() => undefined);
    };
  }, []);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text testID="app-dock-presses">{dockPresses.join(',')}</Text>
      <Text testID="app-launch-args">{App.launchArgs().join(' ')}</Text>
      <Text testID="app-zoom">{String(Math.round(zoom * 100) / 100)}</Text>
      {(['zoomIn', 'zoomOut', 'resetZoom'] as const).map(role => (
        <Pressable
          key={role}
          testID={`app-${role}`}
          onPress={() => Menu.performRole(role)}
        >
          <Text>{role}</Text>
        </Pressable>
      ))}
      <Pressable testID="app-quit" onPress={() => App.quit()}>
        <Text>Quit</Text>
      </Pressable>
      <Text testID="app-second-instances">{seconds.join(' | ')}</Text>
    </View>
  );
}
