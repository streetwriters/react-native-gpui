/**
 * The App module: launch arguments and the arguments of a second launch.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { App } from '@react-native-gpui/core/desktop';

export default function AppFixture() {
  const [seconds, setSeconds] = useState<string[]>([]);
  useEffect(() => {
    const subscription = App.onSecondInstance(args =>
      setSeconds(previous => [...previous, args.join(' ')]),
    );
    return () => subscription.remove();
  }, []);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text testID="app-launch-args">{App.launchArgs().join(' ')}</Text>
      <Pressable testID="app-quit" onPress={() => App.quit()}>
        <Text>Quit</Text>
      </Pressable>
      <Text testID="app-second-instances">{seconds.join(' | ')}</Text>
    </View>
  );
}
