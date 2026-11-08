/**
 * Pointer events during a press: they keep going to the pressed view when the
 * pointer leaves it.
 *
 * @format
 */

import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';

export default function PointerCaptureFixture() {
  const [log, setLog] = useState('');
  const [parentMoves, setParentMoves] = useState(0);
  const lines = useRef<string[]>([]);
  const record =
    (name: string) => (event: { nativeEvent: { pageX: number } }) => {
      lines.current.push(`${name}@${Math.round(event.nativeEvent.pageX)}`);
      setLog(lines.current.join(' '));
    };
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text testID="capture-log">{log}</Text>
      <Text testID="capture-parent-moves">{`parent moves ${parentMoves}`}</Text>
      <View onPointerMove={() => setParentMoves(count => count + 1)}>
        <View
          testID="capture-target"
          onPointerDown={record('down')}
          onPointerMove={record('move')}
          onPointerUp={record('up')}
          style={{ width: 100, height: 50, backgroundColor: '#3b82f6' }}
        />
      </View>
      <View
        testID="capture-other"
        onPointerMove={record('other-move')}
        style={{ width: 100, height: 50, backgroundColor: '#e5e7eb' }}
      />
    </View>
  );
}
