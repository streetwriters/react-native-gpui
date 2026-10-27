import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function ApisFixture() {
  return (
    <ScrollView testID="apis-fixture" contentContainerStyle={styles.content}>
      <Text style={styles.title}>Core APIs</Text>
      <View style={styles.section}>
        <Text style={styles.heading}>Platform</Text>
        <Text testID="platform-version">{String(Platform.Version)}</Text>
        <Text testID="platform-is-testing">{String(Platform.isTesting)}</Text>
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
