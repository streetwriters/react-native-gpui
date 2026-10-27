import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function CoreComponentsFixture() {
  return (
    <ScrollView
      testID="core-components-fixture"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Core components</Text>
      <View style={styles.section}>
        <Text style={styles.heading}>Switch and ActivityIndicator</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 32, gap: 16, backgroundColor: '#fff' },
  title: { fontSize: 20, color: '#111' },
  section: { gap: 8 },
  heading: { fontSize: 16, color: '#333' },
});
