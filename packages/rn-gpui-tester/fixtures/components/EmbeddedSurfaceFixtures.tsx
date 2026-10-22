import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * React content that lives inside a GPUI layout (design 2, direction A).
 *
 * These are the modules the tester's GPUI-first example places in
 * `ReactSurface`s. Each testID is prefixed with the surface's `name` prop, so one
 * module can be placed twice and the e2e can tell the copies apart.
 */

/** A surface that fills the box GPUI gives it, with two focusable targets. */
export function EmbeddedPanel({ name = 'panel' }: { name?: string }) {
  const [focused, setFocused] = useState('none');
  // A focus event does not reach JS from a test app, but a key does: the
  // target that holds focus is the one the key arrives at. So a target reports
  // that it has focus when it receives a key.
  const target = (id: string) => ({
    testID: `${name}-${id}`,
    focusable: true,
    onKeyDown: () => setFocused(id),
    style: {
      height: 32,
      marginBottom: 8,
      backgroundColor: focused === id ? '#2563eb' : '#334155',
    },
  });
  return (
    <View
      testID={`${name}-root`}
      style={{ flex: 1, padding: 8, backgroundColor: '#0f172a' }}
    >
      <Text testID={`${name}-title`} style={{ color: '#e2e8f0' }}>
        {name}
      </Text>
      <Text testID={`${name}-focus`} style={{ color: '#93c5fd' }}>
        focused={focused}
      </Text>
      <View {...target('first')} />
      <View {...target('second')} />
    </View>
  );
}

/**
 * A surface that is exactly as big as its content. Pressing the button adds a
 * row, so its content grows and the GPUI layout around it has to follow.
 */
export function EmbeddedFit({ name = 'fit' }: { name?: string }) {
  const [rows, setRows] = useState(2);
  const [focused, setFocused] = useState('none');
  return (
    <View
      testID={`${name}-root`}
      style={{ width: 180, backgroundColor: '#1e293b' }}
    >
      <Pressable
        testID={`${name}-grow`}
        focusable={false}
        onPress={() => setRows(count => count + 1)}
        style={{ height: 24, backgroundColor: '#475569' }}
      >
        <Text style={{ color: '#f8fafc' }}>grow</Text>
      </Pressable>
      <View
        testID={`${name}-target`}
        focusable
        onKeyDown={() => setFocused('target')}
        style={{ height: 8, backgroundColor: '#64748b' }}
      />
      <Text testID={`${name}-focus`} style={{ color: '#93c5fd', height: 20 }}>
        focused={focused}
      </Text>
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          testID={`${name}-row-${index}`}
          style={{ height: 20, backgroundColor: '#0ea5e9', marginTop: 2 }}
        />
      ))}
    </View>
  );
}
