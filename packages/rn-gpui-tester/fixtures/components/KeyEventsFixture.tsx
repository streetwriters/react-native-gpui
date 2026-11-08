/**
 * Key events reach the focused view once and bubble; press events carry the
 * modifier keys.
 *
 * @format
 */

import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

type KeyEvent = { nativeEvent: { key: string } };

export default function KeyEventsFixture() {
  const [keys, setKeys] = useState('');
  const [press, setPress] = useState('');
  const log = useRef<string[]>([]);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text testID="keys-log">{keys}</Text>
      <Text testID="press-log">{press}</Text>
      <View
        focusable
        testID="keys-parent"
        onKeyDown={(event: KeyEvent) => {
          log.current.push(event.nativeEvent.key);
          setKeys(log.current.join(','));
        }}
      >
        <View
          focusable
          testID="keys-child"
          style={{ width: 100, height: 40, backgroundColor: '#e5e7eb' }}
        >
          <View
            focusable
            testID="keys-grandchild"
            style={{ width: 60, height: 20, backgroundColor: '#3b82f6' }}
          />
        </View>
      </View>
      <Pressable
        testID="press-target"
        onPress={event => {
          const e = event.nativeEvent as typeof event.nativeEvent & {
            shiftKey?: boolean;
            ctrlKey?: boolean;
            altKey?: boolean;
            metaKey?: boolean;
          };
          setPress(
            `shift=${e.shiftKey} ctrl=${e.ctrlKey} alt=${e.altKey} meta=${e.metaKey}`,
          );
        }}
        style={{ width: 100, height: 40, backgroundColor: '#fde68a' }}
      />
    </View>
  );
}
