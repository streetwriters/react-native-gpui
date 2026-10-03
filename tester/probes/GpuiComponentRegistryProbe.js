import React, { useState } from 'react';
import { AppRegistry, Pressable, Text, View } from 'react-native';
import { GpuiTestBox } from '@react-native-gpui/cpp-module-fixture';

function GpuiComponentRegistryProbe() {
  const [label, setLabel] = useState('Tap this registered Fabric component');
  const [taps, setTaps] = useState(0);

  return (
    <View
      style={{
        flex: 1,
        padding: 32,
        justifyContent: 'center',
        backgroundColor: '#101218',
      }}
    >
      <Text style={{ color: 'white', fontSize: 26, marginBottom: 20 }}>
        GPUI app component registry
      </Text>
      <Pressable
        onPress={() => {
          const nextTaps = taps + 1;
          console.log(`[component-registry] press event ${nextTaps}`);
          setTaps(nextTaps);
          setLabel(`Fabric prop update ${nextTaps}`);
        }}
      >
        <GpuiTestBox
          label={label}
          testColor={taps % 2 === 0 ? '#2563eb' : '#9333ea'}
          onTouchEnd={() =>
            console.log(`[component-registry] direct touch event ${taps + 1}`)
          }
          style={{
            minHeight: 84,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
            backgroundColor: taps % 2 === 0 ? '#2563eb' : '#9333ea',
          }}
        >
          <Text style={{ color: 'white', fontSize: 20 }}>{label}</Text>
        </GpuiTestBox>
      </Pressable>
      <Text style={{ color: '#cbd5e1', marginTop: 16 }}>Touch end: {taps}</Text>
    </View>
  );
}

AppRegistry.registerComponent(
  'GpuiComponentRegistryProbe',
  () => GpuiComponentRegistryProbe,
);
