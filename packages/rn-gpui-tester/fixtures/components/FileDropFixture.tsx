/**
 * Files dropped from the operating system: acceptsFiles, the drag events and
 * dragOverStyle.
 *
 * @format
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { ViewProps } from 'react-native';

type DesktopDragEvent = Parameters<NonNullable<ViewProps['onDrop']>>[0];

export default function FileDropFixture() {
  const [log, setLog] = useState<string[]>([]);
  const record = (name: string) => (event: DesktopDragEvent) => {
    const { files, x, y } = event.nativeEvent;
    const summary = files
      .map(
        (file: { name: string; size: number; type: string }) =>
          `${file.name}:${file.size}:${file.type}`,
      )
      .join('+');
    setLog(previous => [
      ...previous,
      name === 'over'
        ? 'over'
        : `${name}(${Math.round(x)},${Math.round(y)}) ${summary}`,
    ]);
  };
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text testID="drop-log">{log.join(' | ')}</Text>
      <View
        testID="drop-zone"
        acceptsFiles
        onDragEnter={record('enter')}
        onDragOver={record('over')}
        onDragLeave={record('leave')}
        onDrop={record('drop')}
        style={{
          width: 240,
          height: 120,
          backgroundColor: '#e5e7eb',
          padding: 10,
        }}
        dragOverStyle={{ backgroundColor: '#10b981' }}
      >
        <View
          testID="drop-inner"
          style={{ width: 80, height: 40, backgroundColor: '#3b82f6' }}
        />
      </View>
      <View
        testID="drop-refuses"
        style={{ width: 240, height: 80, backgroundColor: '#fde68a' }}
      />
    </View>
  );
}
