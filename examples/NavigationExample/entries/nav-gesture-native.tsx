import React, { useEffect, useMemo, useState } from 'react';
import { AppRegistry, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

function NativeGestureProbe() {
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const nativeStarts = useSharedValue(0);
  const nativeUpdates = useSharedValue(0);
  const [status, setStatus] = useState('Waiting for the JS busy interval');
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .onStart(() => {
          nativeStarts.value += 1;
        })
        .onUpdate(event => {
          translationX.value = baseX.value + event.translationX;
          translationY.value = baseY.value + event.translationY;
          nativeUpdates.value += 1;
        })
        .onEnd(() => {
          baseX.value = translationX.value;
          baseY.value = translationY.value;
        })
        .onFinalize(() => {
          baseX.value = translationX.value;
          baseY.value = translationY.value;
        }),
    [baseX, baseY, nativeStarts, nativeUpdates, translationX, translationY],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translationX.value },
      { translateY: translationY.value },
    ],
  }));

  useEffect(() => {
    const timer = setTimeout(() => {
      const started = Date.now();
      setStatus('JS thread busy for 2.5 seconds; drag the blue panel now');
      console.log('[native-gesture] JS busy start');
      while (Date.now() - started < 2500) {
        // Deliberately block JS while the GPUI UI thread handles a pan.
      }
      console.log(
        `[native-gesture] JS busy end; UI starts=${nativeStarts.value} updates=${nativeUpdates.value} x=${Math.round(translationX.value)} y=${Math.round(translationY.value)}`,
      );
      setStatus(
        `JS resumed; native starts ${nativeStarts.value}, updates ${nativeUpdates.value}, x ${Math.round(translationX.value)}, y ${Math.round(translationY.value)}`,
      );
    }, 1000);
    const positionTimer = setTimeout(() => {
      console.log(
        `[native-gesture] final position starts=${nativeStarts.value} x=${Math.round(translationX.value)} y=${Math.round(translationY.value)} updates=${nativeUpdates.value}`,
      );
      setStatus(
        `Final UI position: x ${Math.round(translationX.value)}, y ${Math.round(translationY.value)}; starts ${nativeStarts.value}; updates ${nativeUpdates.value}`,
      );
    }, 7000);
    return () => {
      clearTimeout(timer);
      clearTimeout(positionTimer);
    };
  }, [nativeStarts, nativeUpdates, translationX, translationY]);

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Native gesture + UI worklet</Text>
      <Text style={styles.description}>{status}</Text>
      <Text style={styles.description}>
        Drag the blue panel horizontally or vertically while JavaScript is
        blocked. Its motion stays on the native UI runtime and builds on its
        previous position.
      </Text>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.panel, animatedStyle]}>
          <Text style={styles.panelText}>Pan me while JS is busy</Text>
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
    left: 64,
    top: 240,
    width: 260,
    height: 140,
    borderRadius: 18,
    backgroundColor: '#536dfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelText: { color: '#fff', fontSize: 19, fontWeight: '600' },
});

AppRegistry.registerComponent('NavigationExample', () => NativeGestureProbe);
