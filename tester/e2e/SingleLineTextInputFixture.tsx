import React, { useState } from 'react';
import { AppRegistry, StyleSheet, Text, TextInput, View } from 'react-native';

function SingleLineTextInputFixture() {
  const [value, setValue] = useState('');
  return (
    <View style={styles.page}>
      <Text style={styles.label}>Single-line horizontal scrolling input</Text>
      <TextInput
        testID="single-line-input"
        accessibilityLabel="Single-line test input"
        value={value}
        onChangeText={setValue}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: '#15171f',
  },
  label: { color: '#fff', fontSize: 16 },
  input: {
    width: 280,
    paddingHorizontal: 12,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#6772e5',
  },
});

AppRegistry.registerComponent(
  'SingleLineTextInputFixture',
  () => SingleLineTextInputFixture,
);
