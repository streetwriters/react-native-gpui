import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

const stripes =
  'repeating-linear-gradient(90deg, #ff0000 0px, #ff0000 10px, #0000ff 10px, #0000ff 20px)';
const rings =
  'repeating-radial-gradient(circle at center, #ff0000 0px, #ff0000 10px, #0000ff 10px, #0000ff 20px)';

export default function GradientSnapFixture() {
  const [offsets, setOffsets] = useState('0');
  const [page, setPage] = useState('0');
  const [outerX, setOuterX] = useState('0');
  const [innerY, setInnerY] = useState('0');
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
      <ScrollView
        testID="snap-pages"
        horizontal
        pagingEnabled
        style={{ width: 200, height: 40 }}
        onScroll={event =>
          setPage(String(Math.round(event.nativeEvent.contentOffset.x)))
        }
        scrollEventThrottle={16}
      >
        {[0, 1, 2, 3].map(index => (
          <View key={index} style={{ width: 200, height: 40 }} />
        ))}
      </ScrollView>
      <Text testID="snap-pages-x">{page}</Text>
      <ScrollView
        testID="nest-outer"
        horizontal
        style={{ width: 200, height: 80 }}
        onScroll={event =>
          setOuterX(String(Math.round(event.nativeEvent.contentOffset.x)))
        }
        scrollEventThrottle={16}
      >
        <ScrollView
          testID="nest-inner"
          style={{ width: 200, height: 80 }}
          onScroll={event =>
            setInnerY(String(Math.round(event.nativeEvent.contentOffset.y)))
          }
          scrollEventThrottle={16}
        >
          <View style={{ height: 600 }} />
        </ScrollView>
        <View style={{ width: 400, height: 80 }} />
      </ScrollView>
      <Text testID="nest-offsets">{`${outerX},${innerY}`}</Text>
    </View>
  );
}
