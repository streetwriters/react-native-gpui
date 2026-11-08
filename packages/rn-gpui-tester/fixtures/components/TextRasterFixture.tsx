/**
 * Text drawn the way a browser draws it, for comparing pixels.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

const slot = { backgroundColor: '#ffffff' };

export default function TextRasterFixture() {
  return (
    <View style={{ backgroundColor: '#ffffff' }}>
      <View testID="raster-13-400" style={{ ...slot, width: 60, height: 16 }}>
        <Text style={{ fontFamily: 'Inter', fontSize: 13, color: '#474747' }}>
          Favorites
        </Text>
      </View>
      <View style={{ height: 8 }} />
      <View testID="raster-15-600" style={{ ...slot, width: 104, height: 19 }}>
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: '600',
            color: '#181818',
          }}
        >
          Meeting notes
        </Text>
      </View>
      <View style={{ height: 8 }} />
      <View
        testID="raster-description"
        style={{ ...slot, width: 349, height: 39 }}
      >
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 13,
            lineHeight: 19.2,
            color: '#474747',
          }}
        >
          Meeting notes. A short body of text that wraps onto a second line
        </Text>
      </View>
    </View>
  );
}
