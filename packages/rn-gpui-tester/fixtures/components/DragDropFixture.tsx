/**
 * Dragging a view to another view inside the app: draggable, droppable, the
 * source and target events, the payload and the preview.
 *
 * @format
 */

import React, { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import {
  DragDrop,
  DragPreview,
  useDragAutoScroll,
  useDragState,
} from '@react-native-gpui/core/desktop';

const ITEMS = ['alpha', 'beta', 'gamma'];

export default function DragDropFixture() {
  const [log, setLog] = useState<string[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [taps, setTaps] = useState<string[]>([]);
  const drag = useDragState();
  const scroll = useRef<ScrollViewInstance>(null);
  const autoScroll = useDragAutoScroll(scroll, { edge: 40, speed: 20 });
  const note = (entry: string) => setLog(previous => [...previous, entry]);
  return (
    <View style={{ flex: 1 }}>
      <Text testID="drag-log">{log.join(' | ')}</Text>
      <Text testID="drag-taps">{taps.join(',')}</Text>
      <Text testID="drag-dropped">{dropped.join(',')}</Text>
      <Text testID="drag-state">
        {drag.active ? `active over=${drag.over ?? 'none'}` : 'idle'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 16, padding: 16 }}>
        <View style={{ gap: 8 }}>
          {ITEMS.map(item => (
            <View
              key={item}
              testID={`drag-item-${item}`}
              draggable
              onTouchEnd={() => setTaps(previous => [...previous, item])}
              onDragStart={() => {
                DragDrop.setPayload(item);
                note(`start:${item}`);
              }}
              onDragEnd={event =>
                note(`end:${item}:${event.nativeEvent.dropped}`)
              }
              style={{ width: 120, height: 40, backgroundColor: '#3b82f6' }}
            >
              <Text>{item}</Text>
            </View>
          ))}
        </View>
        <View
          testID="drag-zone"
          droppable
          onDragEnter={() => note('enter')}
          onDragLeave={() => note('leave')}
          onDrop={() => {
            const payload = DragDrop.getPayload<string>();
            note(`drop:${payload}`);
            setDropped(previous => [...previous, String(payload)]);
          }}
          dragOverStyle={{ backgroundColor: '#10b981' }}
          style={{ width: 200, height: 140, backgroundColor: '#e5e7eb' }}
        />
        <View
          testID="drag-refuses"
          style={{ width: 120, height: 140, backgroundColor: '#fde68a' }}
        />
      </View>
      <ScrollView
        ref={scroll}
        testID="drag-scroll"
        style={{ height: 160, marginHorizontal: 16 }}
        {...autoScroll}
      >
        {Array.from({ length: 30 }, (_, index) => (
          <View
            key={index}
            testID={`drag-row-${index}`}
            droppable
            onDrop={() => note(`drop-row:${index}`)}
            style={{ height: 40, backgroundColor: index % 2 ? '#ddd' : '#eee' }}
          >
            <Text>{`row ${index}`}</Text>
          </View>
        ))}
      </ScrollView>
      <DragPreview<string>
        render={payload => (
          <View
            testID="drag-preview"
            style={{ padding: 4, backgroundColor: '#111' }}
          >
            <Text style={{ color: 'white' }}>{payload}</Text>
          </View>
        )}
      />
    </View>
  );
}
