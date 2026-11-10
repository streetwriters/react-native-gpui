import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export default function SurfaceProbeFixture({
  greeting,
}: {
  greeting?: string;
}) {
  const [count, setCount] = useState(0);
  const [typed, setTyped] = useState('');
  const [hover, setHover] = useState('out');
  return (
    <View style={{ padding: 4, gap: 4, backgroundColor: '#0f172a' }}>
      <Text testID="probe-greeting" style={{ color: '#f8fafc' }}>
        {`greeting:${greeting ?? ''}`}
      </Text>
      <Pressable
        testID="probe-press"
        onPress={() => setCount(value => value + 1)}
        onHoverIn={() => setHover('in')}
        onHoverOut={() => setHover('out')}
        style={{ height: 24, backgroundColor: '#334155' }}
      >
        <Text style={{ color: '#f8fafc' }}>press</Text>
      </Pressable>
      <Text
        testID="probe-count"
        style={{ color: '#f8fafc' }}
      >{`count:${count}`}</Text>
      <Text
        testID="probe-hover"
        style={{ color: '#f8fafc' }}
      >{`hover:${hover}`}</Text>
      <TextInput
        testID="probe-input"
        onChangeText={setTyped}
        style={{ height: 24, backgroundColor: '#e2e8f0' }}
      />
      <Text
        testID="probe-typed"
        style={{ color: '#f8fafc' }}
      >{`typed:${typed}`}</Text>
    </View>
  );
}
