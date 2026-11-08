/**
 * A rounded clip on a view that is itself transformed.
 *
 * @format
 */

import React from 'react';
import { View } from 'react-native';

const slot = {
  width: 200,
  height: 200,
  backgroundColor: '#ffffff',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export default function RoundedClipFixture() {
  return (
    <View
      style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
    >
      <View testID="clip-plain" style={slot}>
        <View
          style={{
            width: 100,
            height: 100,
            backgroundColor: '#ff0000',
            transform: [{ scale: 1.4 }],
          }}
        />
      </View>
      <View testID="clip-radius-bg" style={slot}>
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: '#ff0000',
            transform: [{ scale: 1.4 }],
          }}
        />
      </View>
      <View testID="clip-radius-hidden" style={slot}>
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            overflow: 'hidden',
            transform: [{ scale: 1.4 }],
          }}
        >
          <View
            style={{ width: 100, height: 100, backgroundColor: '#ff0000' }}
          />
        </View>
      </View>
      <View testID="clip-rect" style={slot}>
        <View style={{ width: 100, height: 100, overflow: 'hidden', transform: [{ scale: 1.4 }] }}>
          <View style={{ width: 100, height: 100, backgroundColor: '#ff0000' }} />
        </View>
      </View>
      <View testID="clip-shrunk" style={slot}>
        <View style={{ width: 100, height: 100, borderRadius: 50, overflow: 'hidden', transform: [{ scale: 0.7 }] }}>
          <View style={{ width: 100, height: 100, backgroundColor: '#ff0000' }} />
        </View>
      </View>
      <View testID="clip-translated" style={slot}>
        <View style={{ width: 100, height: 100, borderRadius: 50, overflow: 'hidden', transform: [{ translateX: 30 }] }}>
          <View style={{ width: 100, height: 100, backgroundColor: '#ff0000' }} />
        </View>
      </View>
    </View>
  );
}
