import React, { createContext, useContext, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NativeRoot, NativeSlot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;

const Where = createContext('none');

function Reads({ testID }: { testID: string }) {
  return <Text testID={testID}>{`context:${useContext(Where)}`}</Text>;
}

/**
 * React Native content in the slots of a native tree: it takes the width the
 * tree's layout gives it, pushes the native components after it down by its
 * height, receives presses and sees contexts from both sides.
 */
export default function NativeSlotFixture() {
  const [log, setLog] = useState('');
  const [lines, setLines] = useState(1);
  const [shown, setShown] = useState(true);
  const note = (name: string) => setLog(value => `${value}${name},`);
  const red = (name: string, height = 20) => (
    <Box
      testID={`slot-${name}`}
      color={0xff0000}
      height={height}
      onPress={() => note(name)}
    />
  );
  return (
    <Where.Provider value="outer">
      <View style={{ padding: 8, gap: 8 }}>
        <Text testID="slot-log">{`log:${log}`}</Text>
        <View style={{ width: 240, height: 400 }}>
          <NativeRoot testID="slot-root" style={{ width: 240, height: 400 }}>
            <Box direction="column">
              {red('above')}
              <Where.Provider value="native">
                {shown ? (
                  <NativeSlot>
                    <View
                      testID="slot-content"
                      style={{ backgroundColor: '#0000ff', padding: 4 }}
                    >
                      <Text testID="slot-text">
                        {Array.from({ length: lines }, () => 'word').join(' ')}
                      </Text>
                      <Pressable
                        testID="slot-press"
                        onPress={() => note('press')}
                        style={{ height: 30, backgroundColor: '#00ff00' }}
                      />
                      <Reads testID="slot-context" />
                      <NativeRoot style={{ width: 100, height: 20 }}>
                        <Box direction="column">
                          <Box
                            testID="slot-inner"
                            color={0xffff00}
                            height={20}
                            onPress={() => note('inner')}
                          />
                        </Box>
                      </NativeRoot>
                    </View>
                  </NativeSlot>
                ) : null}
              </Where.Provider>
              {red('below')}
            </Box>
          </NativeRoot>
        </View>
        <Pressable
          testID="slot-toggle"
          onPress={() => setShown(value => !value)}
        >
          <Text>toggle</Text>
        </Pressable>
        <Pressable
          testID="slot-grow"
          onPress={() => setLines(value => value * 12)}
        >
          <Text>grow</Text>
        </Pressable>
      </View>
    </Where.Provider>
  );
}
