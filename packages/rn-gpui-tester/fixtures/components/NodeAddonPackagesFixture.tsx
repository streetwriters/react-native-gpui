import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Three unmodified npm packages, one per loader pattern the Babel plugin
 * understands. Nothing here is GPUI-specific: each package ships a stock
 * Node-API `.node` file for Node.js, and the plugin does the platform
 * selection at build time because Hermes has no `process.platform`, `fs` or
 * `path` to do it at run time.
 *
 *   - `@node-rs/crc32`  — an napi-rs generated loader (R6): one big
 *     `process.platform` chain naming per-platform packages and local files.
 *   - `microtime`       — `require('node-gyp-build')(__dirname)` (R4) with a
 *     `prebuilds/darwin-x64+arm64/` universal binary.
 *   - `farmhash@3`      — a static `require('./build/Release/farmhash.node')`
 *     in a `try`/`catch` fallback chain (R1/R2).
 */
export default function NodeAddonPackagesFixture() {
  const [result, setResult] = useState('Ready');

  function run() {
    try {
      // R6. Exported as `crc32(input: string, initialState?: number): number`.
      const crc32 = require('@node-rs/crc32').crc32('hello');
      // R4. Its loader is a napi-rs-independent one-liner; `nowDouble()` is a
      // number and takes no argument, so the assertion is that it is a
      // plausible clock reading rather than a value.
      const microtime = require('microtime');
      const now = microtime.nowDouble();
      // R1/R2. `hash32(string)` returns a number.
      const farmhash = require('farmhash').hash32('hello');
      setResult(
        `npm addons: crc32=${crc32} farmhash=${farmhash} microtime=${now > 1_000_000_000 ? 'ok' : 'bad'}`,
      );
    } catch (error) {
      setResult(
        `Unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>npm Node-API packages</Text>
      <Text style={styles.description}>
        Loads three unmodified packages, one per loader pattern.
      </Text>
      <Pressable testID="native-module-run" onPress={run} style={styles.button}>
        <Text style={styles.buttonText}>Run native calls</Text>
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
