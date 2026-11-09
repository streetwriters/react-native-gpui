import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

const rows = Array.from({ length: 60 }, (_, index) => index);

export default function ReuseUnderPointerFixture() {
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState('');
  return (
    <View style={{ padding: 8 }}>
      <View
        testID="reuse-key"
        focusable
        onKeyDown={() => setCount(value => value + 1)}
        style={{ height: 24, backgroundColor: '#ddd' }}
      >
        <Text testID="reuse-count">{String(count)}</Text>
      </View>
      <TextInput
        testID="reuse-input"
        value={query}
        onChangeText={setQuery}
        style={{ height: 24, backgroundColor: '#fff' }}
      />
      {Array.from({ length: query.length * 8 }, (_, index) => (
        <View
          key={`result-${index}`}
          style={{ flexDirection: 'row', height: 6 }}
        >
          <View style={{ width: 20, height: 6, backgroundColor: '#8f8' }} />
        </View>
      ))}
      <View style={{ height: 40, marginVertical: 4 }}>
        <View
          testID="overlay-row"
          hoverStyle={{ backgroundColor: '#ff0000' }}
          style={{ height: 40, backgroundColor: '#dddddd' }}
        >
          <View
            testID="overlay-row-inner"
            hoverStyle={{ backgroundColor: '#ff8800' }}
            style={{ height: 40, backgroundColor: '#eeeeee' }}
          />
        </View>
        <View
          testID="overlay-above"
          hoverStyle={{ backgroundColor: '#0000ff' }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 120,
            height: 40,
            backgroundColor: '#cccccc',
          }}
        />
      </View>
      {rows.map(row => (
        <View
          key={row}
          testID={`reuse-row-${row}`}
          style={{ flexDirection: 'row', height: 6 }}
        >
          <View style={{ width: 20, height: 6, backgroundColor: '#8cf' }} />
          <View style={{ width: 20, height: 6, backgroundColor: '#fc8' }} />
        </View>
      ))}
    </View>
  );
}
