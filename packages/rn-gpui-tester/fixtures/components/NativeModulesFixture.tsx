import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import CppTurboModuleFixture from './CppTurboModuleFixture';

/**
 * The shape the tester's Node-API fixture exports. It is built like any
 * third-party addon (see `node-addon-fixture/`), so nothing here is
 * GPUI-specific: `add` is synchronous, `asyncAdd` goes through
 * `napi_create_async_work` and returns a promise, and `threadsafePing` calls
 * back from a worker thread through a thread-safe function.
 */
interface NodeAddonFixture {
  add(left: number, right: number): number;
  asyncAdd(left: number, right: number): Promise<number>;
  threadsafePing(callback: (value: number) => void): void;
}

/**
 * Requires a module and returns the error Metro's module guard would otherwise
 * swallow, or null when the load succeeded.
 *
 * Metro wraps every module factory in a guard: when the factory throws it calls
 * `ErrorUtils.reportFatalError` and returns `undefined`, so a plain
 * `require('…')` of a package whose addon is missing yields `undefined` and the
 * caller's own `try`/`catch` never runs. Installing a handler for the duration
 * of the require is the only way for app code to see the loader's message,
 * which carries `code: 'MODULE_NOT_FOUND'` and the locations it tried — the
 * text a developer (and the relocation check) needs.
 */
function requireCapturingError(load: () => unknown): {
  module: unknown;
  error: unknown;
} {
  const errorUtils = (
    globalThis as {
      ErrorUtils?: {
        getGlobalHandler(): (error: unknown, isFatal: boolean) => void;
        setGlobalHandler(
          handler: (error: unknown, isFatal: boolean) => void,
        ): void;
      };
    }
  ).ErrorUtils;
  if (!errorUtils) {
    return { module: load(), error: null };
  }
  const previous = errorUtils.getGlobalHandler();
  let captured: unknown = null;
  errorUtils.setGlobalHandler(error => {
    captured = error;
  });
  let loaded: unknown;
  try {
    loaded = load();
  } finally {
    errorUtils.setGlobalHandler(previous);
  }
  return { module: loaded, error: captured };
}

export default function NativeModulesFixture({
  kind = 'rust',
}: {
  kind?: 'rust' | 'cpp' | 'node-api';
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
        return;
      }
      const { module: addon, error: loadError } = requireCapturingError(() =>
        require('@react-native-gpui/node-addon-fixture'),
      ) as { module: NodeAddonFixture | undefined; error: unknown };
      if (!addon) {
        // The screen shows the loader's own message: `Cannot find Node-API
        // addon '<key>'. Looked in: …`, and its `code`. The relocation check
        // asserts on both.
        const detail =
          loadError instanceof Error
            ? loadError.message
            : loadError
              ? String(loadError)
              : 'the Node-API addon is not loaded';
        const code = (loadError as { code?: string } | null)?.code;
        setResult(`Unavailable: ${detail}${code ? ` [${code}]` : ''}`);
        return;
      }
      const sync = addon.add(19, 23);
      const async = await addon.asyncAdd(20, 22);
      // The thread-safe function's callback runs on the JS thread after a
      // worker thread dispatches it, so the screen waits for it before
      // settling on the final line. Both the sync and async calls are in that
      // line, which is what the e2e test asserts on.
      await new Promise<void>(resolve => {
        let settled = false;
        const finish = (threadsafe: number) => {
          if (settled) return;
          settled = true;
          setResult(
            `Node-API sync + async: ${sync} / ${async} / tsfn ${threadsafe}`,
          );
          resolve();
        };
        addon.threadsafePing(finish);
        // A thread-safe function that never fires must not hang the screen
        // forever; the timeout keeps the UI usable and makes the failure
        // visible instead of silent.
        setTimeout(() => finish(NaN), 5000);
      });
    } catch (error) {
      setResult(
        `Unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const title = {
    'node-api': 'Node-API addon',
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
