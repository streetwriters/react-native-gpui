import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  NativeRoot,
  NativeSlot,
  NativeVirtualList,
} from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;
const Label = 'FixtureNativeText' as unknown as NativeElement;

const mounts = { rows: 0 };

function Row({
  index,
  onPress,
}: {
  index: number;
  onPress: (index: number) => void;
}) {
  useEffect(() => {
    mounts.rows++;
  }, []);
  return (
    <Box
      testID={`vrow-${index}`}
      color={index % 2 ? 0x223344 : 0x334455}
      height={20}
      onPress={() => onPress(index)}
    >
      <Label text={`row ${index}`} />
    </Box>
  );
}

export default function NativeVirtualListFixture() {
  const [log, setLog] = useState('');
  const [created, setCreated] = useState(0);
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <Text testID="vlist-log">{`log:${log}`}</Text>
      <NativeRoot testID="vlist-root" style={{ width: 240, height: 200 }}>
        <NativeVirtualList
          testID="vlist"
          count={10000}
          itemHeight={20}
          renderItem={index =>
            index % 50 === 7 ? (
              <NativeSlot>
                <View
                  testID={`vslot-${index}`}
                  style={{ height: 20, backgroundColor: '#00aa00' }}
                />
              </NativeSlot>
            ) : (
              <Row
                index={index}
                onPress={value => setLog(previous => `${previous}${value},`)}
              />
            )
          }
        />
      </NativeRoot>
      <Pressable testID="vlist-read" onPress={() => setCreated(mounts.rows)}>
        <Text>read</Text>
      </Pressable>
      <Text testID="vlist-created">{`created:${created}`}</Text>
    </View>
  );
}
