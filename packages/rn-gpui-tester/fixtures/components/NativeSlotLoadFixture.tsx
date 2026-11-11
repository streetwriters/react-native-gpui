import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NativeRoot, NativeSlot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Label = 'FixtureNativeText' as unknown as NativeElement;

export default function NativeSlotLoadFixture({
  count = 1000,
}: {
  count?: number;
}) {
  const [tick, setTick] = useState(0);
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <NativeRoot testID="slot-load-root" style={{ width: 240, height: 200 }}>
        <Label text={`tick ${tick}`} />
        <NativeSlot>
          <View>
            {Array.from({ length: count }, (_, index) => (
              <View key={index} style={{ height: 2 }} />
            ))}
          </View>
        </NativeSlot>
      </NativeRoot>
      <Pressable testID="slot-load-tick" onPress={() => setTick(v => v + 1)}>
        <Text>tick</Text>
      </Pressable>
    </View>
  );
}
