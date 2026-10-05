import React, { useState } from 'react';
import {
  AppRegistry,
  Appearance,
  Pressable,
  Text,
  View,
  useColorScheme,
} from 'react-native';

function AppearanceProbe() {
  const [revision, setRevision] = useState(0);
  const colorScheme = useColorScheme();
  const next = colorScheme === 'dark' ? 'light' : 'dark';
  return (
    <View
      testID="appearance-root"
      style={{
        flex: 1,
        padding: 32,
        gap: 16,
        backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
      }}
    >
      <Text
        testID="appearance-status"
        style={{
          fontSize: 20,
          color: colorScheme === 'dark' ? '#fff' : '#111',
        }}
      >
        Appearance: {colorScheme ?? 'unknown'} ({revision})
      </Text>
      <Pressable
        testID="appearance-toggle"
        onPress={() => {
          Appearance.setColorScheme(next);
          setRevision(value => value + 1);
        }}
        style={{ padding: 12, backgroundColor: '#3b82f6' }}
      >
        <Text style={{ color: '#fff' }}>Set {next}</Text>
      </Pressable>
    </View>
  );
}

AppRegistry.registerComponent('AppearanceProbe', () => AppearanceProbe);

export default AppearanceProbe;
