import React, { createContext, useContext, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NativeRoot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;
const Label = 'FixtureNativeText' as unknown as NativeElement;

const Theme = createContext('none');

const COLORS: Record<string, number> = {
  red: 0xff0000,
  green: 0x00ff00,
  blue: 0x0000ff,
};

function Swatch({ name, onPress }: { name: string; onPress?: () => void }) {
  return (
    <Box
      testID={`native-swatch-${name}`}
      color={COLORS[name]}
      width={40}
      height={30}
      onPress={onPress}
    />
  );
}

function Counter({ log }: { log: (line: string) => void }) {
  const theme = useContext(Theme);
  const [count, setCount] = useState(0);
  return (
    <Box
      testID="native-counter"
      accessibilityRole="button"
      accessibilityLabel="Counter"
      color={0x1e3a8a}
      padding={4}
      height={30}
      onPress={() => {
        setCount(value => value + 1);
        log(`pressed ${theme} ${count + 1}`);
      }}
    >
      <Label text={`count ${count}`} />
    </Box>
  );
}

export default function NativeRootFixture() {
  const [order, setOrder] = useState(['red', 'green', 'blue']);
  const [last, setLast] = useState('none');
  const [mounted, setMounted] = useState(true);
  return (
    <Theme.Provider value="blue">
      <View style={{ padding: 8, gap: 8 }}>
        <NativeRoot testID="native-root" style={{ width: 240, height: 120 }}>
          <Box direction="column" gap={4} padding={4} color={0x0f172a}>
            <Counter log={setLast} />
            {mounted ? (
              <Box direction="row" gap={4}>
                {order.map(name => (
                  <Swatch
                    key={name}
                    name={name}
                    onPress={() => setLast(name)}
                  />
                ))}
              </Box>
            ) : null}
          </Box>
        </NativeRoot>
        <Text testID="native-last">{`last:${last}`}</Text>
        <Pressable
          testID="native-reorder"
          onPress={() => setOrder(['blue', 'red', 'green'])}
        >
          <Text>reorder</Text>
        </Pressable>
        <Pressable testID="native-unmount" onPress={() => setMounted(false)}>
          <Text>unmount</Text>
        </Pressable>
      </View>
    </Theme.Provider>
  );
}
