/**
 * Translucent views holding children.
 *
 * @format
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

const slot = {
  width: 120,
  height: 120,
  backgroundColor: '#ffffff',
} as const;

const red = { width: 40, height: 40, backgroundColor: '#ff0000' } as const;

export default function OpacityGroupFixture() {
  return (
    <View
      style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
    >
      <View testID="opacity-plain" style={slot}>
        <View style={{ opacity: 0.5 }}>
          <View style={red} />
        </View>
      </View>
      <View testID="opacity-sized" style={slot}>
        <View style={{ opacity: 0.5, width: 80, height: 80 }}>
          <View style={red} />
        </View>
      </View>
      <View testID="opacity-absolute-child" style={slot}>
        <View style={{ opacity: 0.5 }}>
          <View style={[red, { position: 'absolute', left: 10, top: 10 }]} />
        </View>
      </View>
      <View testID="opacity-absolute" style={slot}>
        <View
          style={{
            opacity: 0.5,
            position: 'absolute',
            left: 10,
            top: 10,
            width: 80,
            height: 80,
          }}
        >
          <View style={red} />
        </View>
      </View>
      <View testID="opacity-rounded" style={slot}>
        <View
          style={{
            opacity: 0.5,
            width: 80,
            height: 80,
            borderRadius: 20,
            overflow: 'hidden',
          }}
        >
          <View style={red} />
        </View>
      </View>
      <View testID="opacity-pressable" style={slot}>
        <Pressable style={{ opacity: 0.5, width: 80, height: 80 }}>
          <View style={red} />
        </Pressable>
      </View>
      <View testID="opacity-text" style={slot}>
        <View style={{ opacity: 0.5, width: 80, height: 40 }}>
          <Text style={{ color: '#ff0000', fontSize: 20 }}>Red</Text>
        </View>
      </View>
      <View testID="opacity-nested" style={slot}>
        <View style={{ opacity: 0.5, width: 80, height: 80 }}>
          <View style={{ opacity: 0.5, width: 60, height: 60 }}>
            <View style={red} />
          </View>
        </View>
      </View>
    </View>
  );
}
