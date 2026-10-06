import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
function PanResponderFixture() {
  const [offset, setOffset] = useState({
    x: 0,
    y: 0,
  });
  const offsetRef = useRef({
    x: 0,
    y: 0,
  });
  const gestureOrigin = useRef({
    x: 0,
    y: 0,
  });
  const [status, setStatus] = useState(
    'Drag the blue panel; its position follows PanResponder',
  );
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          console.log('[pan] shouldStart claim=false');
          return false;
        },
        onMoveShouldSetPanResponder: (_event, gesture) => {
          const shouldClaim =
            Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8;
          console.log(
            `[pan] shouldMove dx=${Math.round(gesture.dx)} dy=${Math.round(gesture.dy)} claim=${shouldClaim}`,
          );
          return shouldClaim;
        },
        onPanResponderGrant: (_event, gesture) => {
          gestureOrigin.current = offsetRef.current;
          console.log(
            `[pan] grant x0=${Math.round(gesture.x0)} y0=${Math.round(gesture.y0)}`,
          );
          setStatus('Responder granted');
        },
        onPanResponderMove: (_event, gesture) => {
          const next = {
            x: gestureOrigin.current.x + gesture.dx,
            y: gestureOrigin.current.y + gesture.dy,
          };
          offsetRef.current = next;
          setOffset(next);
          console.log(
            `[pan] move dx=${Math.round(gesture.dx)} dy=${Math.round(gesture.dy)} x=${Math.round(gesture.moveX)} y=${Math.round(gesture.moveY)}`,
          );
          setStatus(
            `Moving ${Math.round(gesture.dx)}, ${Math.round(gesture.dy)}`,
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          console.log(
            `[pan] release dx=${Math.round(gesture.dx)} dy=${Math.round(gesture.dy)} x=${Math.round(gesture.moveX)} y=${Math.round(gesture.moveY)}`,
          );
          setStatus('Released');
        },
        onPanResponderTerminate: () => {
          console.log('[pan] terminate');
          setStatus('Terminated');
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  return (
    <View style={styles.page}>
      <Text style={styles.title}>PanResponder probe</Text>
      <Text style={styles.description}>
        Start inside the blue panel. It follows the pointer through release or
        cancellation.
      </Text>
      <Text style={styles.status}>{status}</Text>
      <View
        testID="pan-source"
        {...pan.panHandlers}
        style={[
          styles.panTarget,
          {
            transform: [
              {
                translateX: offset.x,
              },
              {
                translateY: offset.y,
              },
            ],
          },
        ]}
      >
        <Text style={styles.targetText}>Drag from here</Text>
      </View>
      <View
        testID="pan-target"
        collapsable={false}
        pointerEvents="none"
        style={styles.releaseArea}
      />
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
    fontSize: 26,
    fontWeight: '700',
  },
  description: {
    color: '#d5d7e0',
    fontSize: 16,
    marginTop: 12,
  },
  status: {
    color: '#aab2ff',
    fontSize: 16,
    marginTop: 12,
  },
  panTarget: {
    position: 'absolute',
    left: 32,
    top: 150,
    width: 240,
    height: 180,
    borderRadius: 16,
    backgroundColor: '#4656c5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  releaseArea: {
    position: 'absolute',
    left: 320,
    top: 250,
    width: 260,
    height: 180,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4656c5',
  },
});
export default PanResponderFixture;
