/**
 * Nodes with known styles, for `getProps`.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

const COLORS: Record<string, string> = {
  hex6: '#008837',
  hex8: '#00883726',
  rgba: 'rgba(0, 136, 55, 0.15)',
  rgb: 'rgb(12, 34, 56)',
  short: '#0f0',
  named: 'tomato',
  hsl: 'hsl(120, 100%, 25%)',
  transparent: 'transparent',
  white: '#ffffff',
  almost: '#010203fe',
};

export default function PropsProbeFixture() {
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <View
        testID="probe-box"
        style={{
          width: 100,
          height: 40,
          opacity: 0.5,
          borderTopWidth: 2,
          borderTopColor: '#ff0000',
          borderLeftWidth: 3,
          borderLeftColor: '#0000ff',
          borderBottomWidth: 1,
          borderBottomColor: '#00ff00',
          borderRadius: 6,
          boxShadow: '2px 3px 4px 1px rgba(0, 0, 0, 0.5)',
        }}
      />
      {Object.entries(COLORS).map(([name, color]) => (
        <View
          key={name}
          testID={`color-${name}`}
          style={{ width: 10, height: 10, backgroundColor: color }}
        />
      ))}
      <Text
        testID="probe-text"
        style={{
          color: '#336699',
          lineHeight: 22,
          letterSpacing: 0.5,
          fontSize: 14,
        }}
      >
        Plain <Text style={{ color: '#cc0000', letterSpacing: 2 }}>nested</Text>
      </Text>
    </View>
  );
}
