import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

const sizes = [13, 15, 16, 20];

function TextInputLineHeightFixture() {
  return (
    <View style={styles.page}>
      {sizes.map(size => (
        <View key={size} style={styles.row}>
          <Text testID={`line-text-${size}`} style={{ fontSize: size }}>
            Hxg
          </Text>
          <TextInput
            testID={`line-input-${size}`}
            defaultValue="Hxg"
            style={[styles.input, { fontSize: size }]}
          />
          <TextInput
            testID={`line-placeholder-${size}`}
            placeholder="Hxg"
            style={[styles.input, { fontSize: size }]}
          />
          <TextInput
            testID={`line-empty-${size}`}
            style={[styles.input, { fontSize: size }]}
          />
          <TextInput
            testID={`line-explicit-${size}`}
            defaultValue="Hxg"
            style={[styles.input, { fontSize: size, lineHeight: size * 2 }]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 12, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  input: { width: 80, padding: 0 },
});

export default TextInputLineHeightFixture;
