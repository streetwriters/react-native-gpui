import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

export default function ScrollRemountFixture() {
  const [generation, setGeneration] = useState(0);
  const [offset, setOffset] = useState(-1);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <View
        testID="remount-key"
        focusable
        onKeyDown={() => {
          setOffset(-1);
          setGeneration(value => value + 1);
        }}
        style={{ height: 20 }}
      >
        <Text testID="remount-generation">{String(generation)}</Text>
      </View>
      <Text testID="remount-offset">{String(Math.round(offset))}</Text>
      <ScrollView
        key={generation}
        testID="remount-scroll"
        style={{ height: 200, width: 300 }}
        scrollEventThrottle={16}
        onScroll={event => setOffset(event.nativeEvent.contentOffset.y)}
      >
        {Array.from({ length: 60 }, (_, index) => (
          <View
            key={index}
            style={{ height: 40, backgroundColor: index % 2 ? '#ddd' : '#eee' }}
          >
            <Text>{`row ${index} of generation ${generation}`}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
