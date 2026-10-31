/**
 * Desktop shell tester screen.
 *
 * This screen grows with each feature step; right now it only proves the
 * `GpuiDesktop` bridge: capability flags read synchronously and an `app.getInfo`
 * round trip through the GPUI main thread.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  DeviceEventEmitter,
  Text,
  TurboModuleRegistry,
  View,
} from 'react-native';
import type { TurboModule } from 'react-native';
import { Desktop, capabilities } from '@react-native-gpui/core/desktop';

interface DevSettingsSpec extends TurboModule {
  addMenuItem(title: string): void;
}

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
  const [devItem, setDevItem] = useState('not pressed');

  // `DevSettings.addMenuItem` does nothing in a release bundle, which is what
  // the e2e runs, so this makes the calls it makes in a dev bundle: the native
  // module adds the item and the press arrives as `didPressMenuItem`.
  useEffect(() => {
    TurboModuleRegistry.get<DevSettingsSpec>('DevSettings')?.addMenuItem(
      'Show Secret Dev Screen',
    );
    const subscription = DeviceEventEmitter.addListener(
      'didPressMenuItem',
      (event: { title: string }) => {
        if (event.title === 'Show Secret Dev Screen') setDevItem('pressed');
      },
    );
    return () => subscription.remove();
  }, []);

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
      <Text testID="dev-menu-item" style={styles.row}>
        {devItem}
      </Text>
      <Text testID="desktop-capabilities" style={styles.row}>
        {JSON.stringify(caps)}
      </Text>
    </View>
  );
}

export default DesktopShellFixture;
