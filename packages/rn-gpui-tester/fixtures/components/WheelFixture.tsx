import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import type { DesktopWheelEventData } from '@react-native-gpui/core/desktop';

type WheelEvent = NativeSyntheticEvent<DesktopWheelEventData>;

export default function WheelFixture() {
  const [log, setLog] = useState<string[]>([]);
  const [last, setLast] = useState<DesktopWheelEventData | null>(null);
  const [offset, setOffset] = useState(0);
  const [prevent, setPrevent] = useState(false);
  const preventRef = useRef(false);
  preventRef.current = prevent;
  const [canvas, setCanvas] = useState({ x: 0, y: 0, scale: 1 });
  const [latency, setLatency] = useState({ last: 0, max: 0, count: 0 });
  const record = (name: string) => (event: WheelEvent) => {
    setLog(current => [...current, name].slice(-12));
    setLast({ ...event.nativeEvent });
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Pressable
        testID="wheel-prevent-toggle"
        onPress={() => setPrevent(value => !value)}
        style={{ padding: 8, backgroundColor: '#ddd' }}
      >
        <Text testID="wheel-prevent">{prevent ? 'prevent' : 'allow'}</Text>
      </Pressable>
      <Text testID="wheel-log">{log.join(',')}</Text>
      <Text testID="wheel-last">{last ? JSON.stringify(last) : ''}</Text>
      <Text testID="wheel-offset">{String(Math.round(offset))}</Text>
      <ScrollView
        testID="wheel-scroll"
        style={{ height: 200, width: 320, backgroundColor: '#eee' }}
        scrollEventThrottle={16}
        onScroll={event => setOffset(event.nativeEvent.contentOffset.y)}
      >
        <View
          testID="wheel-outer"
          onWheelCapture={record('capture:outer')}
          onWheel={record('bubble:outer')}
          style={{ height: 300, padding: 10, backgroundColor: '#cde' }}
        >
          <View
            testID="wheel-target"
            onWheelCapture={record('capture:target')}
            onWheel={event => {
              record('bubble:target')(event);
              if (preventRef.current) event.preventDefault();
            }}
            style={{ height: 100, backgroundColor: '#fc8' }}
          />
          <View
            testID="wheel-plain"
            style={{ height: 100, marginTop: 10, backgroundColor: '#bda' }}
          />
        </View>
        <View style={{ height: 800 }} />
      </ScrollView>
      <View
        testID="wheel-canvas"
        onWheel={event => {
          record('canvas')(event);
          event.preventDefault();
          const wheel = event.nativeEvent;
          setLatency(current => {
            const elapsed = Date.now() - wheel.timestamp;
            return {
              last: elapsed,
              max: Math.max(current.max, elapsed),
              count: current.count + 1,
            };
          });
          setCanvas(current =>
            wheel.ctrlKey
              ? {
                  ...current,
                  scale: current.scale * Math.exp(-wheel.deltaY * 0.01),
                }
              : {
                  ...current,
                  x: current.x - wheel.deltaX,
                  y: current.y - wheel.deltaY,
                },
          );
        }}
        style={{
          width: 200,
          height: 120,
          overflow: 'hidden',
          backgroundColor: '#fff',
        }}
      >
        <View
          testID="wheel-canvas-content"
          style={{
            width: 40,
            height: 40,
            backgroundColor: '#f00',
            transform: [
              { translateX: canvas.x },
              { translateY: canvas.y },
              { scale: canvas.scale },
            ],
          }}
        />
      </View>
      <Text testID="wheel-canvas-state">
        {`${canvas.x.toFixed(1)},${canvas.y.toFixed(1)},${canvas.scale.toFixed(3)}`}
      </Text>
      <Text testID="wheel-latency">
        {`${latency.count},${latency.last.toFixed(0)},${latency.max.toFixed(0)}`}
      </Text>
    </View>
  );
}
