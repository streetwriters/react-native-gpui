import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function LogBoxFixture(): React.ReactNode {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>LogBox notifications</Text>
      <Text testID="logbox-padded-text" style={styles.padded}>
        Text with padding: 12 and a 2pt border
      </Text>
      <Pressable
        testID="logbox-warn"
        accessibilityRole="button"
        onPress={() => console.warn('LogBoxFixture: a warning')}
      >
        <Text style={styles.button}>console.warn</Text>
      </Pressable>
      <Pressable
        testID="logbox-error"
        accessibilityRole="button"
        onPress={() => console.error('LogBoxFixture: an error')}
      >
        <Text style={styles.button}>console.error</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 12, backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, color: '#111' },
  padded: {
    alignSelf: 'flex-start',
    padding: 12,
    borderWidth: 2,
    borderColor: '#3b82f6',
    color: '#111',
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#1f2937',
    color: '#fff',
  },
});

export default LogBoxFixture;
