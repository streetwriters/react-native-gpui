import React, { useMemo } from 'react';
import { Button, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
function GestureFixture() {
  const taps = useSharedValue(0);
  const holds = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((_, success) => {
        if (success) taps.value += 1;
      }),
    [taps],
  );
  const hold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
          holds.value += 1;
        }),
    [holds],
  );
  const pan = useMemo(
    () =>
      Gesture.Pan().onUpdate(event => {
        x.value = event.translationX;
        y.value = event.translationY;
      }),
    [x, y],
  );
  const tapStyle = useAnimatedStyle(() => ({
    opacity: taps.value % 2 ? 0.5 : 1,
  }));
  const holdStyle = useAnimatedStyle(() => ({
    opacity: holds.value % 2 ? 0.5 : 1,
  }));
  const panStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: x.value,
      },
      {
        translateY: y.value,
      },
    ],
  }));
  return (
    <View
      style={{
        flex: 1,
        padding: 32,
        gap: 24,
        backgroundColor: '#171923',
      }}
    >
      <Text
        style={{
          color: '#fff',
        }}
      >
        Native gestures e2e
      </Text>
      <Button
        testID="gesture-busy"
        title="Block JS"
        onPress={() => {
          setTimeout(() => {
            console.info('[gesture] JS blocked begin');
            const end = Date.now() + 3000;
            while (Date.now() < end) {
              /* Exercise UI-thread isolation. */
            }
          }, 0);
        }}
      />
      <GestureDetector gesture={tap}>
        <Animated.View
          testID="gesture-tap"
          style={[
            {
              width: 160,
              height: 70,
              backgroundColor: '#6772e5',
            },
            tapStyle,
          ]}
        />
      </GestureDetector>
      <GestureDetector gesture={hold}>
        <Animated.View
          testID="gesture-hold"
          style={[
            {
              width: 160,
              height: 70,
              backgroundColor: '#78e7c5',
            },
            holdStyle,
          ]}
        />
      </GestureDetector>
      <GestureDetector gesture={pan}>
        <Animated.View
          testID="gesture-pan"
          style={[
            {
              width: 160,
              height: 70,
              backgroundColor: '#fdac68',
            },
            panStyle,
          ]}
        />
      </GestureDetector>
      <View
        testID="gesture-target"
        style={{
          position: 'absolute',
          left: 330,
          top: 430,
          width: 160,
          height: 70,
        }}
      />
    </View>
  );
}
export default GestureFixture;
