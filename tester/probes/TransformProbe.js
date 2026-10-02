import React, {useEffect, useRef} from 'react';
import {Animated, AppRegistry, Easing, Text, View} from 'react-native';

function AnimatedBox({native}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, {toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: native}),
      Animated.timing(progress, {toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: native}),
    ]));
    animation.start();
    return () => animation.stop();
  }, [native, progress]);
  return (
    <View style={{gap: 12}}>
      <Text style={{fontSize: 18, color: '#111'}}>{native ? 'Native driver (green)' : 'JS driver (blue)'}</Text>
      <View style={{width: 360, height: 100, borderWidth: 1, borderColor: '#888', justifyContent: 'center'}}>
        <Animated.View
          testID={native ? 'native-transform' : 'js-transform'}
          style={{width: 100, height: 48, backgroundColor: native ? '#10b981' : '#3b82f6',
            transform: [
              {translateX: progress.interpolate({inputRange: [0, 1], outputRange: [24, 200]})},
              {scale: progress.interpolate({inputRange: [0, 1], outputRange: [0.7, 1.4]})},
            ],
          }}>
          <Text style={{color: '#fff'}}>Translate + scale</Text>
        </Animated.View>
      </View>
    </View>
  );
}

export default function TransformProbe() {
  return (
    <View style={{flex: 1, padding: 32, gap: 24, backgroundColor: '#fff'}}>
      <Text style={{fontSize: 20, color: '#111'}}>Animated translate + scale</Text>
      <Text style={{color: '#111'}}>Both boxes should move right while growing, then move left while shrinking.</Text>
      <AnimatedBox native={false} />
      <AnimatedBox native={true} />
    </View>
  );
}

AppRegistry.registerComponent('TransformProbe', () => TransformProbe);
