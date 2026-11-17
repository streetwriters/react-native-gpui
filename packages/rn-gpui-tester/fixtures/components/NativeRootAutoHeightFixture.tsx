import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NativeRoot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;

/** A NativeRoot with no height of its own, sized by its content. */
export default function NativeRootAutoHeightFixture() {
  const [rows, setRows] = useState(1);
  return (
    <View style={{ padding: 8, gap: 8 }}>
      <Pressable testID="auto-grow" onPress={() => setRows(count => count + 1)}>
        <Text>grow</Text>
      </Pressable>
      <NativeRoot testID="auto-root" style={{ width: 200 }}>
        <Box direction="column">
          {Array.from({ length: rows }, (_, index) => (
            <Box key={index} color={0xff0000} height={20} />
          ))}
        </Box>
      </NativeRoot>
      <Text testID="auto-after">after</Text>
    </View>
  );
}
