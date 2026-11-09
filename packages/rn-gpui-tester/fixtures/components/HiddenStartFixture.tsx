/**
 * An app that starts hidden: it mounts and renders a marker, then shows its
 * window after a delay.
 *
 * @format
 */

import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import {
  useDesktopWindow,
  useWindowState,
} from '@react-native-gpui/core/desktop';

export default function HiddenStartFixture({
  showAfter = 3000,
}: {
  showAfter?: number;
}) {
  const window = useDesktopWindow();
  const visible = useWindowState()?.isVisible;
  useEffect(() => {
    const timer = setTimeout(() => {
      window.show().then(() => window.focus());
    }, showAfter);
    return () => clearTimeout(timer);
  }, [window, showAfter]);
  return (
    <View style={{ flex: 1, backgroundColor: '#3b82f6' }}>
      <View
        testID="hidden-marker"
        style={{ width: 200, height: 100, backgroundColor: '#f59e0b' }}
      />
      <Text testID="hidden-visible">{String(visible)}</Text>
    </View>
  );
}
