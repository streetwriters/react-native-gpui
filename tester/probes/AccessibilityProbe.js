import React from 'react';
import { AppRegistry, Pressable, Text, View } from 'react-native';

function AccessibilityProbe() {
  return (
    <View style={{ flex: 1, padding: 32, gap: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 20, color: '#111' }}>
        AccessKit mapping probe
      </Text>
      <Pressable
        testID="a11y-save-button"
        accessible
        accessibilityRole="button"
        accessibilityLabel="Save document"
        accessibilityState={{ selected: true, expanded: false }}
        style={{ padding: 16, backgroundColor: '#3b82f6' }}
      >
        <Text style={{ color: '#fff' }}>Save</Text>
      </Pressable>
      <View
        testID="a11y-switch"
        accessible
        accessibilityRole="switch"
        accessibilityLabel="Enable notifications"
        accessibilityState={{ checked: true }}
        style={{ width: 180, height: 44, backgroundColor: '#10b981' }}
      />
      <Pressable
        testID="a11y-disabled-button"
        accessible
        disabled
        accessibilityRole="button"
        accessibilityLabel="Unavailable action"
        accessibilityState={{ disabled: true }}
        style={{ padding: 16, backgroundColor: '#999' }}
      >
        <Text style={{ color: '#fff' }}>Unavailable</Text>
      </Pressable>
    </View>
  );
}

AppRegistry.registerComponent('AccessibilityProbe', () => AccessibilityProbe);

export default AccessibilityProbe;
