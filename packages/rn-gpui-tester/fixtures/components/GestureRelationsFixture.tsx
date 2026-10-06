import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
function GestureRelationsFixture() {
  const panCount = useSharedValue(0);
  const tapCount = useSharedValue(0);
  const translationX = useSharedValue(0);
  const panStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: translationX.value,
      },
    ],
  }));
  const [status, setStatus] = useState('Tap or drag the nested panel');
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onUpdate(event => {
          translationX.value = event.translationX;
        })
        .onEnd((_event, success) => {
          if (success) panCount.value += 1;
          translationX.value = 0;
        }),
    [panCount, translationX],
  );
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .requireExternalGestureToFail(pan)
        .onEnd((_event, success) => {
          if (success) tapCount.value += 1;
        }),
    [pan, tapCount],
  );
  useEffect(() => {
    let lastMessage = '';
    const timer = setInterval(() => {
      const message = `Tap ${tapCount.value} · Pan ${panCount.value}`;
      if (message !== lastMessage) {
        lastMessage = message;
        setStatus(message);
        console.log(
          `[native-gesture-relations] tap=${tapCount.value} pan=${panCount.value}`,
        );
      }
    }, 250);
    return () => clearInterval(timer);
  }, [panCount, tapCount]);
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Gesture failure relations</Text>
      <Text style={styles.subtitle}>{status}</Text>
      <Text style={styles.subtitle}>
        Tap waits for the parent Pan to fail. Dragging activates Pan and
        suppresses Tap.
      </Text>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.panTarget, panStyle]}>
          <GestureDetector gesture={tap}>
            <View style={styles.tapTarget}>
              <Text style={styles.panelText}>Tap or drag</Text>
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 32,
    backgroundColor: '#171923',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#d5d7e0',
    fontSize: 17,
    marginTop: 14,
  },
  panTarget: {
    position: 'absolute',
    top: 240,
    left: 64,
    width: 300,
    height: 160,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapTarget: {
    width: 260,
    height: 120,
    borderRadius: 16,
    backgroundColor: '#536dfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
export default GestureRelationsFixture;
