/**
 * The tooltip prop: on a view, on its parent, changing, and removed.
 *
 * @format
 */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDesktopWindow } from '@react-native-gpui/core/desktop';

export default function TooltipFixture() {
  const window = useDesktopWindow();
  const [text, setText] = useState('Create a note');
  const [shown, setShown] = useState(true);
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Pressable
        testID="tooltip-toggle"
        onPress={() => setShown(value => !value)}
      >
        <Text>Toggle</Text>
      </Pressable>
      <Pressable
        testID="tooltip-change"
        onPress={() => setText('Create a notebook')}
      >
        <Text>Change</Text>
      </Pressable>
      <Pressable
        testID="tooltip-zoom"
        onPress={() => window.setZoomFactor(1.5)}
      >
        <Text>Zoom</Text>
      </Pressable>
      {shown ? (
        <View
          testID="tooltip-target"
          tooltip={text}
          style={{ width: 160, height: 60, backgroundColor: '#3b82f6' }}
        >
          <View
            testID="tooltip-child"
            style={{ width: 40, height: 20, backgroundColor: '#1e3a8a' }}
          />
        </View>
      ) : null}
      <View
        testID="tooltip-none"
        style={{ width: 160, height: 60, backgroundColor: '#e5e7eb' }}
      />
    </View>
  );
}
