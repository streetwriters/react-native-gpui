import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your desktop app is ready.</Text>
      <Text style={styles.subtitle}>One React Native project for iOS, Android, and GPUI desktop.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#101218'},
  title: {color: '#f8fafc', fontSize: 28, fontWeight: '600'},
  subtitle: {color: '#cbd5e1', fontSize: 16, marginTop: 12, textAlign: 'center'},
});

export default App;
