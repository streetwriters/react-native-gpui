import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
function AnimatedNode() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      console.log(`[retention-probe] animation step=${tick}`);
      setFrame(tick);
      if (tick === 10) {
        clearInterval(timer);
      }
    }, 100);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return (
    <View>
      <Text testID="retention-step">Step {frame}</Text>
      <View
        style={{
          width: 180,
          height: 48,
          opacity: 0.15 + (frame % 10) / 12,
          backgroundColor: '#3b82f6',
          borderRadius: 8,
        }}
      />
    </View>
  );
}
function RetentionFixture() {
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        gap: 16,
        backgroundColor: '#f5f5f5',
      }}
    >
      <Text
        style={{
          fontSize: 20,
          color: '#111',
        }}
      >
        Retention probe
      </Text>
      <AnimatedNode />
      <View
        style={{
          width: 180,
          height: 48,
          backgroundColor: '#10b981',
        }}
      />
      <Text
        testID="retention-static"
        style={{
          fontSize: 16,
          color: '#111',
        }}
      >
        Static sibling
      </Text>
    </View>
  );
}
export default RetentionFixture;
