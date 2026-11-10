import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Button,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function NetworkProbe() {
  const [result, setResult] = useState('idle');
  const request = async () => {
    setResult('loading');
    try {
      const response = await fetch('http://127.0.0.1:43181/idle');
      setResult(await response.text());
    } catch (error) {
      setResult(`error: ${String(error)}`);
    }
  };
  return (
    <View style={styles.row}>
      <Button testID="e2e-network-request" title="Fetch" onPress={request} />
      <Text testID="e2e-network-result" style={styles.text}>
        {result}
      </Text>
    </View>
  );
}

function AnimationProbe() {
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  return (
    <View style={styles.row}>
      <Button
        testID="e2e-animation-start"
        title="Start loop"
        onPress={() => {
          const loop = Animated.loop(
            Animated.timing(progress, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }),
          );
          animation.current = loop;
          loop.start();
        }}
      />
      <Animated.View
        testID="e2e-animation-indicator"
        style={[styles.dot, { opacity: progress }]}
      />
      <Button
        testID="e2e-animation-stop"
        title="Stop loop"
        onPress={() => animation.current?.stop()}
      />
    </View>
  );
}

function TimerProbe() {
  const [result, setResult] = useState('idle');
  return (
    <View style={styles.row}>
      <Button
        testID="e2e-timer-start"
        title="Schedule timer"
        onPress={() => {
          setResult('pending');
          setTimeout(() => setResult('timer-fired'), 700);
        }}
      />
      <Text testID="e2e-timer-result" style={styles.text}>
        {result}
      </Text>
    </View>
  );
}

function DragProbe() {
  const [dx, setDx] = useState(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => setDx(gesture.dx),
      onPanResponderRelease: (_event, gesture) => setDx(gesture.dx),
    }),
  ).current;
  return (
    <View style={[styles.row, { gap: 24 }]}>
      <View
        testID="e2e-drag-source"
        {...responder.panHandlers}
        style={[styles.drag, { backgroundColor: '#6772e5' }]}
      />
      <View
        testID="e2e-drag-target"
        style={[styles.drag, { backgroundColor: '#3a4056' }]}
      />
      <Text testID="e2e-drag-result" style={styles.text}>
        dx:{Math.round(dx)}
      </Text>
    </View>
  );
}

function ActionabilityProbe() {
  return (
    <View style={styles.actionability}>
      <View
        testID="e2e-hidden"
        collapsable={false}
        style={[styles.cell, { opacity: 0 }]}
      />
      <View
        testID="e2e-disabled"
        accessibilityState={{ disabled: true }}
        style={[styles.cell, { position: 'absolute', left: -32 }]}
      />
      <View
        testID="e2e-covered"
        collapsable={false}
        style={[styles.cell, { position: 'absolute' }]}
      />
      <View
        testID="e2e-cover"
        collapsable={false}
        style={[
          styles.cell,
          { position: 'absolute', backgroundColor: '#171923' },
        ]}
      />
    </View>
  );
}

export default function E2EProbesFixture() {
  const [route, setRoute] = useState<'Home' | 'Details 1'>('Home');
  const [value, setValue] = useState('');
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (route === 'Home') return false;
        setRoute('Home');
        return true;
      },
    );
    return () => subscription.remove();
  }, [route]);
  return (
    <View style={styles.root}>
      <Text testID={`${route}-title`} style={styles.title}>
        {route}
      </Text>
      <TextInput
        testID="e2e-text-input"
        accessibilityLabel="Desktop test input"
        value={value}
        onChangeText={setValue}
        style={styles.input}
      />
      <NetworkProbe />
      <DragProbe />
      {route === 'Home' ? (
        <Button title="Open details" onPress={() => setRoute('Details 1')} />
      ) : (
        <>
          <AnimationProbe />
          <TimerProbe />
          <ActionabilityProbe />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, gap: 12, backgroundColor: '#171923' },
  title: { color: '#fff', fontSize: 22 },
  text: { color: '#fff' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  input: {
    color: '#fff',
    borderWidth: 1,
    borderColor: '#6772e5',
    padding: 12,
  },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#aab2ff' },
  drag: { width: 88, height: 44, borderRadius: 8 },
  actionability: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
  },
  cell: { width: 24, height: 24 },
});
