/**
 * Perf Monitor.
 *
 * Toggles the host-drawn overlay and reports the counters it exposes. The
 * overlay itself is GPUI-painted, so this screen only drives it.
 *
 * @format
 */

import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PerfMonitor, type PerfMetrics } from '@react-native-gpui/core/desktop';

// `DevSettings` is a no-op outside `__DEV__`, so the fixture drives the
// `DevMenu` TurboModule directly: the same module RN's dev menu uses, and the
// one the host registers.
const NativeDevMenu =
  require('react-native/src/private/devsupport/devmenu/specs/NativeDevMenu').default;

const styles = {
  page: { padding: 20, gap: 10, backgroundColor: '#f4f5f7', flex: 1 },
  heading: { fontSize: 22, fontWeight: '700' as const, color: '#18212f' },
  row: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    color: '#243247',
  },
  button: {
    padding: 10,
    backgroundColor: '#dce9ff',
    borderRadius: 8,
    color: '#164a9b',
  },
};

function PerfMonitorFixture() {
  const [enabled, setEnabled] = useState(false);
  const [metrics, setMetrics] = useState('none');
  const [error, setError] = useState('');

  const toggle = useCallback(async () => {
    try {
      const next = await PerfMonitor.toggle();
      setEnabled(next);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const read = useCallback(async () => {
    try {
      const value: PerfMetrics = await PerfMonitor.getMetrics();
      setMetrics(JSON.stringify(value));
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Perf monitor</Text>
      <Text testID="perf-enabled" style={styles.row}>
        enabled: {String(enabled)}
      </Text>
      <Text testID="perf-metrics" style={styles.row}>
        {metrics}
      </Text>
      {error ? (
        <Text testID="perf-error" style={styles.row}>
          error: {error}
        </Text>
      ) : null}
      <Pressable testID="perf-toggle" onPress={toggle}>
        <Text style={styles.button}>Toggle the perf monitor</Text>
      </Pressable>
      <Pressable testID="perf-read" onPress={read}>
        <Text style={styles.button}>Read metrics</Text>
      </Pressable>
      <Pressable
        testID="perf-devdettings-on"
        onPress={() => NativeDevMenu.setProfilingEnabled(true)}
      >
        <Text style={styles.button}>DevMenu.setProfilingEnabled(true)</Text>
      </Pressable>
      <Pressable
        testID="perf-devdettings-off"
        onPress={() => NativeDevMenu.setProfilingEnabled(false)}
      >
        <Text style={styles.button}>DevMenu.setProfilingEnabled(false)</Text>
      </Pressable>
      <Pressable
        testID="perf-devmenu-show"
        onPress={() => NativeDevMenu.show()}
      >
        <Text style={styles.button}>DevMenu.show()</Text>
      </Pressable>
    </View>
  );
}

export default PerfMonitorFixture;
