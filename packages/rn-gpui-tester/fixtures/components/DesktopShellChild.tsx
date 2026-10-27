/**
 * The component a secondary window runs. It reports the window id
 * it was started with, which proves `initialProps.windowId` and the
 * `DesktopWindowContext` wrapper work.
 *
 * @format
 */

import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import {
  useDesktopWindow,
  useWindowFocus,
  useWindowState,
} from '@react-native-gpui/core/desktop';

export interface DesktopShellChildProps {
  windowId?: number;
  label?: string;
}

function DesktopShellChild(props: DesktopShellChildProps) {
  const win = useDesktopWindow();
  const dimensions = useWindowDimensions();
  const focused = useWindowFocus();
  const windowState = useWindowState();
  return (
    <View
      style={{
        flex: 1,
        padding: 20,
        gap: 8,
        backgroundColor: '#eef4ff',
      }}
    >
      <Text testID="desktop-child-window-id" style={{ fontSize: 18 }}>
        child windowId: {win.id}
      </Text>
      <Text testID="desktop-child-prop-window-id">
        initialProps.windowId: {String(props.windowId)}
      </Text>
      <Text testID="desktop-child-focus">{String(focused)}</Text>
      <Text testID="desktop-child-width">
        {String(Math.round(windowState?.bounds.width ?? -1))}
      </Text>
      <Text testID="desktop-child-dimensions-width">
        {String(Math.round(dimensions.width))}
      </Text>
      <Text testID="desktop-child-label">label: {props.label ?? '(none)'}</Text>
    </View>
  );
}

export default DesktopShellChild;
