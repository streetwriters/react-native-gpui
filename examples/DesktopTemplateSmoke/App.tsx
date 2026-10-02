import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import NativeCppExample from '@react-native-gpui/cpp-module-fixture';
import NativeFixture from '@react-native-gpui/native-module-fixture';

function App(): React.JSX.Element {
  const [cppGreeting, setCppGreeting] = useState(
    'Waiting for C++ TurboModule…',
  );
  const [rustGreeting, setRustGreeting] = useState(
    'Waiting for Rust TurboModule…',
  );

  useEffect(() => {
    if (Platform.OS !== 'gpui') {
      return;
    }
    const greeting = NativeCppExample.greet('GPUI');
    console.log(`[cpp-turbo] ${greeting}`);
    setCppGreeting(greeting);
    const rustResult = NativeFixture.greet('GPUI');
    console.log(`[rust-turbo] ${rustResult}`);
    setRustGreeting(rustResult);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your desktop app is ready.</Text>
      <Text style={styles.subtitle}>
        One React Native project for iOS, Android, and GPUI desktop.
      </Text>
      <Text style={styles.module}>C++ TurboModule: {cppGreeting}</Text>
      <Text style={styles.module}>Rust TurboModule: {rustGreeting}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#101218',
  },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '600' },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  module: { color: '#93c5fd', fontSize: 16, marginTop: 20 },
});

export default App;
