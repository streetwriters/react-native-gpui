import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  FixtureBadge,
  FixtureBadgeProbe,
} from '@react-native-gpui/fixture-component-module';

/**
 * Phase C's proof screen: a component the module crate paints, with props core
 * never saw, next to the probe that reports the module's own counters.
 */
export default function FixtureModuleProbeFixture() {
  const [tickCount, setTickCount] = useState(0);
  const [frameTicks, setFrameTicks] = useState(-1);
  const [propReads, setPropReads] = useState(-1);
  useEffect(() => {
    const timer = setInterval(() => {
      setTickCount(previous => previous + 1);
      setFrameTicks(FixtureBadgeProbe.frameTicks());
      setPropReads(FixtureBadgeProbe.propReads());
    }, 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <View
      testID="fixture-module-probe"
      style={{ flex: 1, padding: 32, gap: 16, backgroundColor: '#0f172a' }}
    >
      <Text style={{ color: '#fff', fontSize: 24 }}>
        A module with no core change
      </Text>
      <FixtureBadge
        testID="fixture-badge"
        label="FixtureBadge"
        tickCount={tickCount}
        style={{ height: 84, borderRadius: 12 }}
      />
      <Text testID="fixture-badge-frame-ticks" style={{ color: '#93c5fd' }}>
        frame ticks: {frameTicks}
      </Text>
      <Text testID="fixture-badge-prop-reads" style={{ color: '#93c5fd' }}>
        prop reads: {propReads}
      </Text>
    </View>
  );
}
