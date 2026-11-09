import React from 'react';
import { View } from 'react-native';

const slot = {
  width: 100,
  height: 100,
  backgroundColor: '#ffffff',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const box = {
  width: 60,
  height: 60,
  backgroundColor: '#dddddd',
  outlineColor: '#ff0000',
  outlineWidth: 4,
  outlineOffset: 2,
} as const;

export default function OutlineRadiusFixture() {
  return (
    <View
      style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
    >
      <View testID="outline-square" style={slot}>
        <View style={box} />
      </View>
      <View testID="outline-rounded" style={slot}>
        <View style={[box, { borderRadius: 10 }]} />
      </View>
      <View testID="outline-round-corners" style={slot}>
        <View
          style={[
            box,
            {
              borderTopLeftRadius: 10,
              borderBottomRightRadius: 10,
            },
          ]}
        />
      </View>
      <View testID="outline-dashed" style={slot}>
        <View style={[box, { borderRadius: 10, outlineStyle: 'dashed' }]} />
      </View>
    </View>
  );
}
