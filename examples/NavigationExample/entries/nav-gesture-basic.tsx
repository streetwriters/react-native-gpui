import React, { useEffect, useMemo, useState } from 'react';
import { AppRegistry, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

function NativeGestureBasicProbe() {
  const tapCount = useSharedValue(0);
  const longPressCount = useSharedValue(0);
  const tapStyle = useAnimatedStyle(() => ({
    backgroundColor: tapCount.value % 2 === 1 ? '#10a37f' : '#536dfe',
  }));
  const longPressStyle = useAnimatedStyle(() => ({
    backgroundColor: longPressCount.value % 2 === 1 ? '#536dfe' : '#10a37f',
  }));
  const [status, setStatus] = useState(
    'Tap or hold a panel to change its color',
  );
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(500)
        .onEnd((_event, success) => {
          if (success) tapCount.value += 1;
        }),
    [tapCount],
  );
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
          longPressCount.value += 1;
        }),
    [longPressCount],
  );

  useEffect(() => {
    const busyTimer = setTimeout(() => {
      const started = Date.now();
      console.log('[native-gesture-basic] JS busy start');
      while (Date.now() - started < 2200) {
        // Deliberately block JS to confirm native gesture callbacks stay live.
      }
      console.log('[native-gesture-basic] JS busy end');
    }, 800);
    let lastStatus = '';
    const timer = setInterval(() => {
      const message = `UI worklet counts: tap ${tapCount.value}, long press ${longPressCount.value}`;
      if (message !== lastStatus) {
        lastStatus = message;
        console.log(
          `[native-gesture-basic] tap=${tapCount.value} longPress=${longPressCount.value}`,
        );
        setStatus(message);
      }
    }, 500);
    return () => {
      clearTimeout(busyTimer);
      clearInterval(timer);
    };
  }, [longPressCount, tapCount]);

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Native tap and long press</Text>
      <Text style={styles.description}>{status}</Text>
      <Text style={styles.description}>
        Gestures are recognized natively and update shared values on the UI
        runtime while JavaScript is busy.
      </Text>
      <GestureDetector gesture={tap}>
        <Animated.View style={[styles.panel, styles.tap, tapStyle]}>
          <Text style={styles.panelText}>Tap</Text>
        </Animated.View>
      </GestureDetector>
      <GestureDetector gesture={longPress}>
        <Animated.View style={[styles.panel, styles.hold, longPressStyle]}>
          <Text style={styles.panelText}>Long press</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 32, backgroundColor: '#171923' },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  description: { color: '#d5d7e0', fontSize: 17, marginTop: 14 },
  panel: {
    position: 'absolute',
    top: 240,
    width: 260,
    height: 140,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tap: { left: 64, backgroundColor: '#536dfe' },
  hold: { left: 364, backgroundColor: '#10a37f' },
  panelText: { color: '#fff', fontSize: 19, fontWeight: '600' },
});

AppRegistry.registerComponent(
  'NavigationExample',
  () => NativeGestureBasicProbe,
);
