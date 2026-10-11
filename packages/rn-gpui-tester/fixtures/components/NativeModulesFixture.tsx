import type { NodeApiFixture } from '@react-native-gpui/node-api-fixture';
import type { PrebuiltNodeApiFixture } from '@react-native-gpui/node-api-prebuilt-fixture';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import CppTurboModuleFixture from './CppTurboModuleFixture';

export default function NativeModulesFixture({
  kind = 'rust',
}: {
  kind?: 'rust' | 'cpp' | 'node-api' | 'node-api-prebuilt';
}) {
  const [result, setResult] = useState('Ready');
  if (kind === 'cpp') {
    return <CppTurboModuleFixture />;
  }
  async function run() {
    try {
      if (kind === 'rust') {
        const module =
          require('@react-native-gpui/native-module-fixture').default;
        setResult(module.greet('GPUI Tester'));
      } else if (kind === 'node-api-prebuilt') {
        const addon: PrebuiltNodeApiFixture =
          require('@react-native-gpui/node-api-prebuilt-fixture').default;
        setResult(
          `Prebuilt Node-API: ${addon.seven()} + ${addon.seven()} = ${addon.add(7, 7)}`,
        );
      } else {
        const addon: NodeApiFixture = require('../../gpui_node_api_smoke.node');
        setResult(`Node-API: 19 + 23 = ${addon.add(19, 23)}`);
        const value = await addon.asyncAdd(20, 22);
        setResult(`Node-API sync + async: 42 / ${value}`);
      }
    } catch (error) {
      setResult(
        `Unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const title = {
    'node-api': 'Node-API addon',
    'node-api-prebuilt': 'Prebuilt Node-API addon',
    rust: 'Rust TurboModule',
    cpp: 'C++ TurboModule',
  }[kind];
  return (
    <View style={styles.page}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>
        Call the native module and inspect its response.
      </Text>
      <Pressable testID="native-module-run" onPress={run} style={styles.button}>
        <Text style={styles.buttonText}>Run native call</Text>
      </Pressable>
      <Text testID="native-module-result" style={styles.result}>
        {result}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, padding: 28, gap: 18, backgroundColor: '#171923' },
  title: { fontSize: 26, fontWeight: '700', color: '#fff' },
  description: { fontSize: 16, color: '#bec8dc' },
  button: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#5865f2',
    alignSelf: 'flex-start',
  },
  buttonText: { fontSize: 16, color: '#fff' },
  result: { fontSize: 18, color: '#8ce6bc' },
});
