import React, { useState } from 'react';
import { AppRegistry, StyleSheet, Text, View } from 'react-native';
import {
  BorderlessButton,
  GestureHandlerRootView,
  RectButton,
} from 'react-native-gesture-handler';

export default function GestureButtonsProbe() {
  const [rectPresses, setRectPresses] = useState(0);
  const [borderlessPresses, setBorderlessPresses] = useState(0);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Text style={styles.title}>RNGH button compatibility</Text>
      <Text style={styles.status}>
        RectButton: {rectPresses} · BorderlessButton: {borderlessPresses}
      </Text>
      <RectButton
        style={styles.rectButton}
        underlayColor="#ffffff"
        activeOpacity={0.2}
        onPress={() => setRectPresses(count => count + 1)}
      >
        <Text style={styles.buttonText}>RectButton</Text>
      </RectButton>
      <BorderlessButton
        style={styles.borderlessButton}
        activeOpacity={0.35}
        onPress={() => setBorderlessPresses(count => count + 1)}
      >
        <Text style={styles.buttonText}>BorderlessButton</Text>
      </BorderlessButton>
      <View style={styles.note}>
        <Text style={styles.noteText}>Click either native-backed button.</Text>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 32,
    gap: 20,
    backgroundColor: '#111827',
  },
  title: { color: '#f9fafb', fontSize: 28, fontWeight: '700' },
  status: { color: '#d1d5db', fontSize: 18 },
  rectButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  borderlessButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    paddingVertical: 18,
    backgroundColor: '#059669',
  },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  note: { marginTop: 20 },
  noteText: { color: '#9ca3af', fontSize: 16 },
});

AppRegistry.registerComponent('NavigationExample', () => GestureButtonsProbe);
