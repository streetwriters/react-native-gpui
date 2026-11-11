/**
 * Window state, window controls and the zoom factor of the current window.
 *
 * @format
 */

import React, { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import {
  useDesktopWindow,
  useWindowState,
} from '@react-native-gpui/core/desktop';

function Action({ name, run }: { name: string; run: () => Promise<unknown> }) {
  const [error, setError] = useState('');
  return (
    <Pressable
      testID={`window-action-${name}`}
      onPress={() => {
        run().then(
          () => setError(''),
          (e: Error) => setError(String(e.message ?? e)),
        );
      }}
      style={{ padding: 8, backgroundColor: '#e5e7eb' }}
    >
      <Text>{error ? `${name}: ${error}` : name}</Text>
    </Pressable>
  );
}

export default function WindowStateFixture() {
  const window = useDesktopWindow();
  const state = useWindowState();
  const size = useWindowDimensions();
  const [presses, setPresses] = useState(0);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Pressable
        testID="zoom-box"
        onPress={() => setPresses(count => count + 1)}
        style={{ width: 100, height: 50, backgroundColor: '#3b82f6' }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Action name="title" run={() => window.setTitle('Renamed window')} />
        <Action name="zoom-2" run={() => window.setZoomFactor(2)} />
        <Action name="zoom-1" run={() => window.setZoomFactor(1)} />
        <Action name="hide" run={() => window.hide()} />
        <Action name="show" run={() => window.show()} />
        <Action name="minimize" run={() => window.minimize()} />
        <Action
          name="minimize-hide"
          run={async () => {
            await window.minimize();
            await window.hide();
          }}
        />
        <Action
          name="show-focus"
          run={async () => {
            await window.show();
            await window.focus();
          }}
        />
        <Action name="maximize" run={() => window.maximize()} />
        <Action name="unmaximize" run={() => window.unmaximize()} />
        <Action name="fullscreen" run={() => window.setFullscreen(true)} />
        <Action name="windowed" run={() => window.setFullscreen(false)} />
        <Action name="focus" run={() => window.focus()} />
        <Action
          name="background"
          run={() => window.setBackgroundColor('#102030')}
        />
        <Action name="dark" run={() => window.setChromeAppearance('dark')} />
      </View>
      <Text testID="window-state">
        {state
          ? `visible=${state.isVisible} maximized=${state.isMaximized} fullscreen=${state.isFullscreen} minimized=${state.isMinimized} title=${state.title} zoom=${state.zoomFactor}`
          : 'no state'}
      </Text>
      <Text testID="window-width">{`width=${Math.round(size.width)}`}</Text>
      <Text testID="window-presses">{`presses=${presses}`}</Text>
    </View>
  );
}
