import React, { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

export default function ScrollPointerFixture() {
  const [log, setLog] = useState('');
  const lines = useRef<string[]>([]);
  const record =
    (name: string) =>
    (event: {
      nativeEvent: { offsetX: number; offsetY: number; buttons: number };
    }) => {
      const { offsetX, offsetY, buttons } = event.nativeEvent;
      lines.current.push(
        `${name}:${Math.round(offsetX)},${Math.round(offsetY)}:${buttons}`,
      );
      setLog(lines.current.join(' '));
    };
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text testID="scroll-pointer-log">{log}</Text>
      <ScrollView
        testID="scroll-pointer-scroll"
        style={{ height: 240, width: 320, backgroundColor: '#eee' }}
      >
        <View style={{ height: 60 }} />
        <View
          testID="scroll-pointer-target"
          onPointerDown={record('down')}
          onPointerMove={record('move')}
          onPointerUp={record('up')}
          style={{ height: 120, backgroundColor: '#3b82f6' }}
        />
        <View style={{ height: 600 }} />
      </ScrollView>
    </View>
  );
}
