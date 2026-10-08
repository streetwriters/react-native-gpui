/**
 * Desktop shell (plan 7.1–7.6) tester screen.
 *
 * This screen grows with each feature step; right now it only proves the
 * `GpuiDesktop` bridge: capability flags read synchronously and an `app.getInfo`
 * round trip through the GPUI main thread.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Desktop, capabilities } from 'react-native-gpui/desktop';

const styles = {
  page: {
    padding: 24,
    gap: 10,
    backgroundColor: '#f4f5f7',
    flex: 1,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#18212f',
  },
  row: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    color: '#243247',
  },
};

function DesktopShellFixture() {
  const caps = capabilities();
  const [info, setInfo] = useState('pending');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Desktop.getInfo()
      .then(result => {
        if (!cancelled) {
          setInfo(`${result.platform}/${result.arch}`);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Desktop shell</Text>
      <Text testID="desktop-info" style={styles.row}>
        app.getInfo: {info}
        {error ? ` (error: ${error})` : ''}
      </Text>
      <Text testID="desktop-capabilities" style={styles.row}>
        {JSON.stringify(caps)}
      </Text>
    </View>
  );
}

export default DesktopShellFixture;
