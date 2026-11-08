/**
 * Reanimated CSS transitions and keyframe animations on a plain
 * `Animated.View`: opacity, background color and transform.
 *
 * @format
 */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

const GREEN = '#008837';
const DURATION = '1500ms';

type Kind = 'opacity' | 'color' | 'transform';

const FROM: Record<Kind, object> = {
  opacity: { opacity: 0 },
  color: { backgroundColor: '#ffffff' },
  transform: { transform: [{ translateX: 40 }] },
};
const TO: Record<Kind, object> = {
  opacity: { opacity: 1 },
  color: { backgroundColor: GREEN },
  transform: { transform: [{ translateX: 0 }] },
};
const PROPERTY: Record<Kind, string> = {
  opacity: 'opacity',
  color: 'backgroundColor',
  transform: 'transform',
};

function Slot({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <View
      testID={`${id}-parent`}
      style={{ width: 40, height: 40, backgroundColor: '#ffffff', margin: 4 }}
    >
      {children}
    </View>
  );
}

function Transition({ kind, on }: { kind: Kind; on: boolean }) {
  return (
    <Slot id={`css-transition-${kind}`}>
      <Animated.View
        style={
          {
            width: 40,
            height: 40,
            backgroundColor: kind === 'color' ? '#ffffff' : GREEN,
            ...(on ? TO[kind] : FROM[kind]),
            transitionProperty: PROPERTY[kind],
            transitionDuration: DURATION,
            transitionTimingFunction: 'linear',
          } as never
        }
      />
    </Slot>
  );
}

function Keyframes({ kind, on }: { kind: Kind; on: boolean }) {
  return (
    <Slot id={`css-animation-${kind}`}>
      {on ? (
        <Animated.View
          style={
            {
              width: 40,
              height: 40,
              backgroundColor: kind === 'color' ? '#ffffff' : GREEN,
              animationName: { from: FROM[kind], to: TO[kind] },
              animationDuration: DURATION,
              animationTimingFunction: 'linear',
              animationFillMode: 'both',
            } as never
          }
        />
      ) : null}
    </Slot>
  );
}

export default function CssAnimationsFixture() {
  const [on, setOn] = useState(false);
  const kinds: Kind[] = ['opacity', 'color', 'transform'];
  return (
    <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
      <Pressable testID="css-flip" onPress={() => setOn(true)}>
        <Text>start</Text>
      </Pressable>
      <View style={{ width: '100%' }} />
      {kinds.map(kind => (
        <Transition key={`t-${kind}`} kind={kind} on={on} />
      ))}
      {kinds.map(kind => (
        <Keyframes key={`a-${kind}`} kind={kind} on={on} />
      ))}
    </View>
  );
}
