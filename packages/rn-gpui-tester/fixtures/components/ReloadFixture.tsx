import React, { useEffect } from 'react';
import { DevSettings, StyleSheet, Text, View } from 'react-native';
import label from '../../reloadLabel';
function ReloadFixture(): React.ReactNode {
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[reload-probe] calling DevSettings.reload()');
      DevSettings.reload('reload-probe');
    }, 7000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.app}>
      <Text style={styles.title}>reload probe</Text>
      <Text style={styles.label}>{label}</Text>
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
  label: {
    position: 'absolute',
    left: 24,
    top: 64,
    fontSize: 18,
    color: '#b91c1c',
  },
});
export default ReloadFixture;
