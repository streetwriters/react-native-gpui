import React, { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { ScrollBar } from '@react-native-gpui/core/desktop';

export default function ScrollIndicatorFixture() {
  const scroll = useRef<ScrollViewInstance>(null);
  const [step, setStep] = useState(0);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <View
        testID="indicator-key"
        focusable
        onKeyDown={() => {
          if (step === 0) scroll.current?.scrollTo({ y: 300, animated: false });
          if (step === 1) scroll.current?.scrollTo({ y: 0, animated: true });
          if (step === 2) scroll.current?.flashScrollIndicators();
          setStep(value => value + 1);
        }}
        style={{ height: 20 }}
      >
        <Text testID="indicator-step">{String(step)}</Text>
      </View>
      <ScrollView
        ref={scroll}
        testID="indicator-scroll"
        style={{ height: 200, width: 300 }}
      >
        {Array.from({ length: 40 }, (_, index) => (
          <View key={index} style={{ height: 40 }}>
            <Text>{`row ${index}`}</Text>
          </View>
        ))}
        <ScrollBar autoHideDelay={300} />
      </ScrollView>
    </View>
  );
}
