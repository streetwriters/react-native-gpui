import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import NativeViewHost from '@react-native-gpui/core/NativeViewHost';

export default function NativeViewFixture({
  webView = false,
}: {
  webView?: boolean;
}) {
  const [overlay, setOverlay] = useState(false);
  return (
    <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: '#171923' }}>
      <Text style={{ fontSize: 24, color: '#fff' }}>
        {webView ? 'WKWebView composition' : 'Native NSView composition'}
      </Text>
      <Pressable
        testID="native-overlay-toggle"
        onPress={() => setOverlay(value => !value)}
        style={{
          padding: 12,
          backgroundColor: '#5865f2',
          alignSelf: 'flex-start',
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#fff' }}>
          {overlay ? 'Hide overlay' : 'Show overlay'}
        </Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <NativeViewHost
          testID="native-view-host"
          viewName={webView ? 'TesterWebView' : 'BlueNativeProbe'}
          style={{ flex: 1 }}
        />
        {overlay ? (
          <View
            testID="native-view-overlay"
            style={{
              position: 'absolute',
              top: 32,
              left: 32,
              right: 32,
              height: 100,
              borderRadius: 12,
              backgroundColor: '#d946ef',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 22, color: '#fff' }}>
              React Native above the native view
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
