// TODO 3.1 verification: change one RN node every animation frame and check
// the Rust `[retention]` render counter stays flat for its siblings.
//
//   RN_GPUI_MODULE=RetentionProbe \
//   RN_GPUI_SOURCE_URL=tester/probes/RetentionProbe \
//   RN_GPUI_DEBUG_RENDER_COUNTS=1 RN_GPUI_RUN_MS=5000 \
//     ./packages/react-native-gpui/ReactGpui/target/debug/rn-gpui

import React, { useEffect, useState } from 'react';
import { AppRegistry, Text, View } from 'react-native';

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
    <View
      style={{
        width: 180,
        height: 48,
        opacity: 0.15 + (frame % 10) / 12,
        backgroundColor: '#3b82f6',
        borderRadius: 8,
      }}
    />
  );
}

function RetentionProbe() {
  return (
    <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: '#f5f5f5' }}>
      <Text style={{ fontSize: 20, color: '#111' }}>Retention probe</Text>
      <AnimatedNode />
      <View style={{ width: 180, height: 48, backgroundColor: '#10b981' }} />
      <Text style={{ fontSize: 16, color: '#111' }}>Static sibling</Text>
    </View>
  );
}

AppRegistry.registerComponent('RetentionProbe', () => RetentionProbe);
