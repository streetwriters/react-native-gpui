/**
 * State style props on a View: hoverStyle, activeStyle, focusStyle,
 * focusVisibleStyle, group, groupHoverStyle and groupActiveStyle.
 *
 * @format
 */

import React, { useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';

const BASE = '#3b82f6';
const HOVER = '#f59e0b';
const ACTIVE = '#ef4444';
const FOCUS = '#10b981';
const GROUP = '#8b5cf6';

const box = { width: 120, height: 60, backgroundColor: BASE };

export default function StateStylesFixture() {
  const rendered = useRef(0);
  rendered.current += 1;
  const opacity = useRef(new Animated.Value(1)).current;
  const [animating, setAnimating] = useState(false);

  return (
    <View style={{ padding: 16, gap: 12, flex: 1 }}>
      <Text testID="state-render-count">{`renders:${rendered.current}`}</Text>

      <View
        testID="state-hover"
        style={box}
        hoverStyle={{ backgroundColor: HOVER }}
        activeStyle={{ backgroundColor: ACTIVE }}
      />

      <View
        testID="state-active"
        style={box}
        activeStyle={{ backgroundColor: ACTIVE }}
      />

      <View
        testID="state-border"
        style={{
          width: 120,
          height: 60,
          backgroundColor: '#ffffff',
          borderWidth: 6,
          borderColor: '#000000',
        }}
        hoverStyle={{ borderColor: '#ef4444', borderBottomColor: '#10b981' }}
      />

      <View testID="state-text" hoverStyle={{ color: '#ef4444' }}>
        <Text style={{ color: '#000000', fontSize: 30, fontWeight: '900' }}>
          MMMMMM
        </Text>
      </View>

      <View
        testID="state-transform"
        style={{ width: 100, height: 40, backgroundColor: '#3b82f6' }}
        hoverStyle={{ transform: [{ scale: 2 }] }}
      />

      <View
        testID="state-focus"
        focusable
        style={box}
        focusStyle={{ backgroundColor: FOCUS }}
      />

      <View testID="state-focus-other" focusable style={box} />

      <View
        testID="state-group"
        group="card"
        style={{ width: 200, height: 80, backgroundColor: '#e5e7eb' }}
      >
        <View
          testID="state-group-child"
          style={{ width: 60, height: 60, backgroundColor: BASE }}
          groupHoverStyle={{ group: 'card', style: { backgroundColor: GROUP } }}
          groupActiveStyle={{
            group: 'card',
            style: { backgroundColor: ACTIVE },
          }}
        />
      </View>

      <View
        testID="state-group-other"
        group="card"
        style={{ width: 200, height: 80, backgroundColor: '#e5e7eb' }}
      >
        <View
          testID="state-group-child-other"
          style={{ width: 60, height: 60, backgroundColor: BASE }}
          groupHoverStyle={{ group: 'card', style: { backgroundColor: GROUP } }}
          groupActiveStyle={{
            group: 'card',
            style: { backgroundColor: ACTIVE },
          }}
        />
      </View>

      <Animated.View
        testID="state-animated"
        style={[box, { opacity }]}
        hoverStyle={{ backgroundColor: HOVER, opacity: 0.2 }}
      />
      <Text
        testID="state-animate-toggle"
        onPress={() => {
          setAnimating(true);
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: 600000,
            useNativeDriver: true,
          }).start();
        }}
      >
        {animating ? 'animating' : 'animate'}
      </Text>
    </View>
  );
}
