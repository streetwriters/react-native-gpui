/**
 * Text drawn the way a browser draws it, for comparing pixels.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

const slot = { backgroundColor: '#ffffff' };

export function BorderedParent() {
  return (
    <View
      style={{
        width: 379,
        backgroundColor: '#ffffff',
        paddingLeft: 13,
        paddingTop: 10,
        borderLeftWidth: 2,
        borderLeftColor: 'transparent',
        borderTopWidth: 3,
        borderTopColor: 'transparent',
      }}
    >
      <View
        testID="bordered-child"
        style={{ width: 20, height: 10, backgroundColor: '#000000' }}
      />
    </View>
  );
}

export default function TextRasterFixture() {
  return (
    <View style={{ backgroundColor: '#ffffff' }}>
      <BorderedParent />
      <View
        testID="raster-13-400"
        style={{ width: 60, height: 16, backgroundColor: '#f6f7f9' }}
      >
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
        style={{
          width: 379,
          borderLeftWidth: 2,
          borderLeftColor: 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: '#e5e5e5',
          paddingLeft: 13,
          paddingRight: 15,
          paddingTop: 10,
          paddingBottom: 10,
          backgroundColor: '#ffffff',
        }}
      >
        <View style={{ gap: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7.5,
              minWidth: 0,
            }}
          >
            <Text
              testID="raster-nested-title"
              numberOfLines={1}
              style={{
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: '600',
                color: '#181818',
                minWidth: 0,
              }}
            >
              Meeting notes
            </Text>
          </View>
        </View>
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
