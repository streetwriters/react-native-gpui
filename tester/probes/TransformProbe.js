import React, {useEffect, useState} from 'react';
import {AppRegistry, Text, View} from 'react-native';

export default function TransformProbe() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    let next = 0;
    const timer = setInterval(() => {
      next = (next + 1) % 8;
      setStep(next);
    }, 180);
    return () => clearInterval(timer);
  }, []);

  const scale = 0.7 + step * 0.1;
  const translateX = step * 8;
  return (
    <View style={{flex: 1, padding: 32, gap: 24, backgroundColor: '#fff'}}>
      <Text style={{fontSize: 20, color: '#111'}}>Transform bounds probe</Text>
      <View style={{width: 260, height: 100, borderWidth: 1, borderColor: '#888'}}>
        <View
          testID="translated-scaled-view"
          style={{
            width: 100,
            height: 48,
            backgroundColor: '#3b82f6',
            transform: [{translateX}, {scale}],
          }}>
          <Text style={{color: '#fff'}}>scale {scale.toFixed(1)}</Text>
        </View>
      </View>
      <View
        testID="rotate-spike"
        style={{width: 96, height: 42, backgroundColor: '#10b981', transform: [{rotate: '12deg'}]}}
      />
      <Text style={{color: '#111'}}>The rotated view records the §5.2 support spike.</Text>
    </View>
  );
}

AppRegistry.registerComponent('TransformProbe', () => TransformProbe);
