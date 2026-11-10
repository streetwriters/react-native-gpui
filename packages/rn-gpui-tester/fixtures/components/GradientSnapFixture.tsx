import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

const stripes =
  'repeating-linear-gradient(90deg, #ff0000 0px, #ff0000 10px, #0000ff 10px, #0000ff 20px)';
const rings =
  'repeating-radial-gradient(circle at center, #ff0000 0px, #ff0000 10px, #0000ff 10px, #0000ff 20px)';

export default function GradientSnapFixture() {
  const [offsets, setOffsets] = useState('0');
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <View
        testID="repeat-linear"
        style={{
          width: 100,
          height: 20,
          experimental_backgroundImage: stripes,
        }}
      />
      <View
        testID="repeat-radial"
        style={{ width: 100, height: 100, experimental_backgroundImage: rings }}
      />
      <View
        testID="repeat-mixed"
        style={{
          width: 100,
          height: 20,
          experimental_backgroundImage: `${stripes}, linear-gradient(#00ff00, #00ff00)`,
        }}
      />
      <ScrollView
        testID="snap-offsets"
        style={{ width: 200, height: 100 }}
        snapToOffsets={[0, 100, 350]}
        decelerationRate="fast"
        onScroll={event =>
          setOffsets(String(Math.round(event.nativeEvent.contentOffset.y)))
        }
        scrollEventThrottle={16}
      >
        <View style={{ height: 600 }} />
      </ScrollView>
      <Text testID="snap-offsets-y">{offsets}</Text>
    </View>
  );
}
