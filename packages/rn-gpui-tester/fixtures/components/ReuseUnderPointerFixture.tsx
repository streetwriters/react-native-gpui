import React, { useState } from 'react';
import { Text, View } from 'react-native';

const rows = Array.from({ length: 60 }, (_, index) => index);

export default function ReuseUnderPointerFixture() {
  const [count, setCount] = useState(0);
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
