import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NativeRoot } from '@react-native-gpui/core/desktop';
import { nativeRootStats } from '@react-native-gpui/core/src-gpui/src/private/desktop/nativeRoot/reconciler';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;
const Label = 'FixtureNativeText' as unknown as NativeElement;

export default function NativeRootLoadFixture({
  count = 1000,
}: {
  count?: number;
}) {
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState('none');
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <NativeRoot testID="load-root" style={{ width: 240, height: 120 }}>
        <Box direction="column">
          {Array.from({ length: count }, (_, index) => (
            <Label key={index} text={`row ${index} tick ${tick}`} />
          ))}
        </Box>
      </NativeRoot>
      <Pressable
        testID="load-tick"
        onPress={() => {
          setTick(value => value + 1);
          setTimeout(
            () =>
              setStats(
                `${nativeRootStats.ops},${nativeRootStats.bytes},${nativeRootStats.ms}`,
              ),
            50,
          );
        }}
      >
        <Text>tick</Text>
      </Pressable>
      <Text testID="load-stats">{`stats:${stats}`}</Text>
    </View>
  );
}
