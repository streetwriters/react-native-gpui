import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
function Broken(): React.ReactNode {
  throw new Error('ErrorFixture: boom while rendering');
}
function ErrorFixture(): React.ReactNode {
  return (
    <View style={styles.app}>
      <Text style={styles.title}>Error probe</Text>
      <Broken />
    </View>
  );
}
const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    position: 'absolute',
    left: 24,
    top: 24,
    fontSize: 20,
    color: '#111',
  },
});
export default ErrorFixture;
