import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
function Bar({ label, ticks, color }) {
  return (
    <View
      style={{
        gap: 4,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          color: '#111',
        }}
      >
        {label} {ticks}
      </Text>
      <View
        style={{
          height: 16,
          width: 24 + ticks * 12,
          backgroundColor: color,
          borderRadius: 4,
        }}
      />
    </View>
  );
}
function FrameFixture() {
  const [effects, setEffects] = useState(0);
  const [intervals, setIntervals] = useState(0);
  const [rafs, setRafs] = useState(0);
  useEffect(() => {
    console.log('[frame-probe] useEffect ran');
    console.log(
      `[frame-probe] timers setTimeout=${String(setTimeout)} setInterval=${String(setInterval)} raf=${String(requestAnimationFrame)}`,
    );
    setEffects(n => n + 1);
    setTimeout(() => console.log('[frame-probe] timeout 0 fired'), 0);
    for (const delay of [1, 8, 50, 300, 1000]) {
      setTimeout(() => {
        console.log(`[frame-probe] timeout ${delay} fired at ${Date.now()}`);
      }, delay);
    }
    const interval = setInterval(() => {
      console.log('[frame-probe] interval callback fired');
      setIntervals(n => n + 1);
    }, 250);
    let running = true;
    let frame = requestAnimationFrame(function tick() {
      if (!running) {
        return;
      }
      setRafs(n => {
        if (n % 60 === 0) {
          console.log(`[frame-probe] raf heartbeat ${n} at ${Date.now()}`);
        }
        return n + 1;
      });
      frame = requestAnimationFrame(tick);
    });
    return () => {
      running = false;
      clearInterval(interval);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    console.log(
      `[frame-probe] commit effects=${effects} intervals=${intervals} rafs=${rafs}`,
    );
  });
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
        Frame probe
      </Text>
      <Bar label="effect" ticks={effects} color="#8b5cf6" />
      <Bar label="interval" ticks={intervals} color="#3b82f6" />
      <Bar label="raf" ticks={rafs} color="#10b981" />
    </View>
  );
}
export default FrameFixture;
