import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  NativeRoot,
  NativeSlot,
  NativeVirtualList,
  type NativeVirtualListHandle,
} from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;
const Label = 'FixtureNativeText' as unknown as NativeElement;

const mounts = { rows: 0 };

const heightOf = (index: number, grown: number) =>
  20 + (index % 4) * 10 + (index === grown ? 40 : 0);

function Row({
  index,
  grown,
  onPress,
}: {
  index: number;
  grown: number;
  onPress: (entry: string) => void;
}) {
  const [born] = useState(index);
  useEffect(() => {
    mounts.rows++;
  }, []);
  return (
    <Box
      testID={`vrow-${index}`}
      color={index % 2 ? 0x223344 : 0x334455}
      height={heightOf(index, grown)}
      onPress={() => onPress(`${index}:${born}`)}
    >
      <Label text={`row ${index} born ${born}`} />
    </Box>
  );
}

export default function NativeVirtualListFixture({
  count = 10000,
  recycleItems = false,
}: {
  count?: number;
  recycleItems?: boolean;
}) {
  const [log, setLog] = useState('');
  const [created, setCreated] = useState(0);
  const [grown, setGrown] = useState(-1);
  const [ends, setEnds] = useState(0);
  const list = useRef<NativeVirtualListHandle>(null);
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <Text testID="vlist-log">{`log:${log}`}</Text>
      <NativeRoot testID="vlist-root" style={{ width: 240, height: 200 }}>
        <NativeVirtualList
          ref={list}
          testID="vlist"
          count={count}
          estimatedItemHeight={35}
          recycleItems={recycleItems}
          keyExtractor={index => `row-${index}`}
          onEndReached={() => setEnds(value => value + 1)}
          renderItem={index =>
            index % 50 === 7 ? (
              <NativeSlot>
                <View
                  testID={`vslot-${index}`}
                  style={{
                    height: 30 + (index % 3) * 10,
                    backgroundColor: '#00aa00',
                  }}
                />
              </NativeSlot>
            ) : (
              <Row
                index={index}
                grown={grown}
                onPress={entry => setLog(previous => `${previous}${entry},`)}
              />
            )
          }
        />
      </NativeRoot>
      <Pressable testID="vlist-read" onPress={() => setCreated(mounts.rows)}>
        <Text>read</Text>
      </Pressable>
      <Text testID="vlist-created">{`created:${created}`}</Text>
      <Text testID="vlist-ends">{`ends:${ends}`}</Text>
      <Pressable
        testID="vlist-start"
        onPress={() => list.current?.scrollToIndex({ index: 500 })}
      >
        <Text>start</Text>
      </Pressable>
      <Pressable
        testID="vlist-center"
        onPress={() =>
          list.current?.scrollToIndex({ index: 800, align: 'center' })
        }
      >
        <Text>center</Text>
      </Pressable>
      <Pressable
        testID="vlist-end"
        onPress={() =>
          list.current?.scrollToIndex({ index: 1200, align: 'end' })
        }
      >
        <Text>end</Text>
      </Pressable>
      <Pressable
        testID="vlist-top"
        onPress={() => list.current?.scrollToOffset({ offset: 0 })}
      >
        <Text>top</Text>
      </Pressable>
      <Pressable testID="vlist-grow" onPress={() => setGrown(498)}>
        <Text>grow</Text>
      </Pressable>
    </View>
  );
}
