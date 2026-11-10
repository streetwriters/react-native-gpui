import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { NativeRoot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;

/**
 * One screen for the mixed-rendering matrix: a native tree under each kind of
 * React Native parent, with a pressable native box in it and a React Native text
 * that says what was pressed.
 */
export default function NativeMatrixFixture() {
  const [log, setLog] = useState('');
  const [offset, setOffset] = useState(0);
  const note = (name: string) => setLog(value => `${value}${name},`);
  const red = (name: string, width = 100, height = 60) => (
    <Box
      testID={`matrix-${name}`}
      color={0xff0000}
      width={width}
      height={height}
      onPress={() => note(name)}
      onHoverIn={() => note(`${name}:in`)}
      onHoverOut={() => note(`${name}:out`)}
    />
  );
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <Text testID="matrix-log">{`log:${log}`}</Text>

      <View
        testID="matrix-clip"
        style={{ width: 100, height: 60, borderRadius: 30, overflow: 'hidden' }}
      >
        <NativeRoot style={{ width: 100, height: 60 }}>
          <Box direction="column">{red('clipped')}</Box>
        </NativeRoot>
      </View>

      <View style={{ transform: [{ translateX: 50 }] }}>
        <NativeRoot style={{ width: 100, height: 60 }}>
          <Box direction="column">{red('moved')}</Box>
        </NativeRoot>
      </View>

      <View style={{ width: 100, height: 60 }}>
        <NativeRoot style={{ width: 100, height: 60 }}>
          <Box direction="column">{red('covered')}</Box>
        </NativeRoot>
        <Pressable
          testID="matrix-cover"
          onPress={() => note('cover')}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 100,
            height: 30,
          }}
        />
      </View>

      <ScrollView
        testID="matrix-scroll"
        style={{ width: 120, height: 100 }}
        scrollEventThrottle={16}
        onScroll={event =>
          setOffset(Math.round(event.nativeEvent.contentOffset.y))
        }
      >
        <View style={{ height: 80 }} />
        <NativeRoot style={{ width: 100, height: 60 }}>
          <Box direction="column">{red('scrolled')}</Box>
        </NativeRoot>
        <View style={{ height: 200 }} />
      </ScrollView>
      <Text testID="matrix-offset">{`offset:${offset}`}</Text>
    </View>
  );
}
