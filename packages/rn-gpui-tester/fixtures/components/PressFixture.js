import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
const round = value =>
  typeof value === 'number' ? Math.round(value * 10) / 10 : value;
function describe(event) {
  const e = event.nativeEvent;
  const touch = (e.changedTouches && e.changedTouches[0]) || {};
  const id = touch.identifier != null ? touch.identifier : e.identifier;
  const locationX = e.locationX != null ? e.locationX : e.offsetX;
  const locationY = e.locationY != null ? e.locationY : e.offsetY;
  return `target=${e.target} id=${id} page=(${round(e.pageX)},${round(e.pageY)}) location=(${round(locationX)},${round(locationY)}) touches=${e.touches ? e.touches.length : '-'}`;
}
const logLayout = name => event => {
  const e = event.nativeEvent;
  console.log(
    `[press-probe] layout ${name} target=${e.target} at (${Math.round(e.layout.x)},${Math.round(e.layout.y)}) ${Math.round(e.layout.width)}x${Math.round(e.layout.height)}`,
  );
};
function PressFixture() {
  const [n, setN] = useState(0);
  const log = (name, event) =>
    console.log(`[press-probe] ${name} ${describe(event)}`);
  useEffect(() => {
    if (n > 0) {
      console.log(`[press-probe] onPress -> counter=${n}`);
    }
  }, [n]);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#f5f5f5',
      }}
    >
      <Text
        style={{
          position: 'absolute',
          left: 24,
          top: 24,
          fontSize: 20,
          color: '#111',
        }}
      >
        Press probe
      </Text>

      <Pressable
        onLayout={logLayout('pressable')}
        onPress={() => setN(value => value + 1)}
        onPressIn={() => console.log('[press-probe] onPressIn')}
        onPressOut={() => console.log('[press-probe] onPressOut')}
        style={{
          position: 'absolute',
          left: 24,
          top: 80,
          width: 200,
          height: 48,
          backgroundColor: '#10b981',
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: 'white',
          }}
        >
          Pressed {n} times
        </Text>
      </Pressable>

      <View
        onLayout={logLayout('plain')}
        onTouchStart={event => log('touchStart(plain)', event)}
        onTouchEnd={event => log('touchEnd(plain)', event)}
        onPointerDown={event => log('pointerDown(plain)', event)}
        onPointerUp={event => log('pointerUp(plain)', event)}
        style={{
          position: 'absolute',
          left: 24,
          top: 160,
          width: 200,
          height: 48,
          backgroundColor: '#e5e7eb',
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text
          onLayout={logLayout('plain-inner')}
          onTouchStart={event => log('touchStart(plain-inner)', event)}
        >
          plain inner
        </Text>
      </View>
    </View>
  );
}
export default PressFixture;
