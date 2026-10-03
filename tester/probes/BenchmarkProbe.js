// TODO 3.3 — 10,000 mounted RN View nodes for retention, scroll and animation
// benchmarks. Use RN_GPUI_MODULE=BenchIdle|BenchScroll|BenchAnimate.

import React, { useEffect, useMemo, useState } from 'react';
import { AppRegistry, ScrollView, View } from 'react-native';

const NODE_COUNT = 10_000;

function AnimatedRow() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setStep(current);
      if (current >= 1600) {
        clearInterval(timer);
      }
    }, 16);
    return () => clearInterval(timer);
  }, []);

  return (
    <View
      style={{
        height: 24,
        backgroundColor: '#3b82f6',
        opacity: 0.2 + (step % 10) / 12,
      }}
    />
  );
}

function BenchmarkProbe({ mode }) {
  const rows = useMemo(
    () =>
      Array.from({ length: NODE_COUNT }, (_, index) => {
        const style = {
          height: 24,
          backgroundColor: index % 2 === 0 ? '#e5e7eb' : '#f5f5f5',
        };
        return mode === 'animate' && index === 0 ? (
          <AnimatedRow key={index} />
        ) : (
          <View key={index} style={style} />
        );
      }),
    [mode],
  );

  useEffect(() => {
    console.log(`[10k-bench] mode=${mode} mounted_nodes=${NODE_COUNT}`);
  }, [mode]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>{rows}</ScrollView>
  );
}

AppRegistry.registerComponent('BenchIdle', () => () => (
  <BenchmarkProbe mode="idle" />
));
AppRegistry.registerComponent('BenchScroll', () => () => (
  <BenchmarkProbe mode="scroll" />
));
AppRegistry.registerComponent('BenchAnimate', () => () => (
  <BenchmarkProbe mode="animate" />
));
