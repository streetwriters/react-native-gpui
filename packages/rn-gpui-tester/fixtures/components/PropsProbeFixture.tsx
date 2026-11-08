/**
 * Nodes with known styles, for `getProps`.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

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
