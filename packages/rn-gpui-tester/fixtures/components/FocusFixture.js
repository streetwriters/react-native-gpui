import React, { useState } from 'react';
import { Text, View } from 'react-native';
function FocusFixture() {
  const [focused, setFocused] = useState('none');
  const [keys, setKeys] = useState('');
  const propsFor = name => ({
    focusable: true,
    onFocus: () => {
      setFocused(name);
      console.log(`[FocusFixture] focus ${name}`);
    },
    onBlur: () => console.log(`[FocusFixture] blur ${name}`),
    onKeyDown: event => {
      const key = event.nativeEvent.key;
      setKeys(value => `${value}${key}`);
      console.log(`[FocusFixture] keydown ${name} ${key}`);
    },
    onKeyUp: event =>
      console.log(`[FocusFixture] keyup ${name} ${event.nativeEvent.key}`),
    style: {
      width: 260,
      height: 72,
      marginBottom: 16,
      padding: 12,
      backgroundColor: '#dbeafe',
      borderWidth: 2,
      borderColor: focused === name ? '#2563eb' : '#94a3b8',
    },
  });
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        backgroundColor: '#fff',
      }}
    >
      <Text
        style={{
          fontSize: 18,
          color: '#111',
        }}
      >
        Keyboard focus and Tab order
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: '#111',
        }}
      >
        focused={focused}; keys={keys}
      </Text>
      <View {...propsFor('first')}>
        <Text
          style={{
            fontSize: 14,
            color: '#111',
          }}
        >
          First focus stop
        </Text>
      </View>
      <View {...propsFor('second')}>
        <Text
          style={{
            fontSize: 14,
            color: '#111',
          }}
        >
          Second focus stop
        </Text>
      </View>
    </View>
  );
}
export default FocusFixture;
