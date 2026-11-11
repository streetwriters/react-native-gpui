import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NativeRoot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;
const Label = 'FixtureNativeText' as unknown as NativeElement;

const Refresh = (globalThis as { __ReactRefresh?: any }).__ReactRefresh;

function Greeting() {
  const [count, setCount] = useState(0);
  return (
    <Box
      testID="dev-box"
      padding={4}
      onPress={() => setCount(value => value + 1)}
    >
      <Label text={`v1 count ${count}`} />
    </Box>
  );
}

function GreetingEdited() {
  const [count, setCount] = useState(0);
  return (
    <Box
      testID="dev-box"
      padding={4}
      onPress={() => setCount(value => value + 1)}
    >
      <Label text={`v2 count ${count}`} />
    </Box>
  );
}

Refresh?.register(Greeting, 'NativeRootDevFixture Greeting');

function Boom(): never {
  throw new Error('boom inside the native tree');
}

export default function NativeRootDevFixture() {
  const [broken, setBroken] = useState(false);
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <NativeRoot testID="dev-root" style={{ width: 240, height: 80 }}>
        <Box direction="column">
          <Greeting />
          {broken ? <Boom /> : null}
        </Box>
      </NativeRoot>
      <Pressable
        testID="dev-edit"
        onPress={() => {
          Refresh?.register(GreetingEdited, 'NativeRootDevFixture Greeting');
          Refresh?.performReactRefresh();
        }}
      >
        <Text>edit</Text>
      </Pressable>
      <Pressable testID="dev-break" onPress={() => setBroken(true)}>
        <Text>break</Text>
      </Pressable>
    </View>
  );
}
