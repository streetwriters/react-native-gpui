import React, {useEffect, useState} from 'react';
import {Platform, StyleSheet, Text, TurboModuleRegistry, View, type TurboModule} from 'react-native';

interface CppExampleSpec extends TurboModule {
  greet(name: string): string;
}

function App(): React.JSX.Element {
  const [cppGreeting, setCppGreeting] = useState('Waiting for C++ TurboModule…');

  useEffect(() => {
    if (Platform.OS !== 'gpui') {
      return;
    }
    const module = TurboModuleRegistry.getEnforcing<CppExampleSpec>('NativeCppExample');
    const greeting = module.greet('GPUI');
    console.log(`[cpp-turbo] ${greeting}`);
    setCppGreeting(greeting);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your desktop app is ready.</Text>
      <Text style={styles.subtitle}>One React Native project for iOS, Android, and GPUI desktop.</Text>
      <Text style={styles.module}>C++ TurboModule: {cppGreeting}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#101218'},
  title: {color: '#f8fafc', fontSize: 28, fontWeight: '600'},
  subtitle: {color: '#cbd5e1', fontSize: 16, marginTop: 12, textAlign: 'center'},
  module: {color: '#93c5fd', fontSize: 16, marginTop: 20},
});

export default App;
