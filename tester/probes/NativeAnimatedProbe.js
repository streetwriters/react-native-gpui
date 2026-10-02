import React, {useEffect, useRef} from 'react';
import {Animated, AppRegistry, Text, View} from 'react-native';

export default function NativeAnimatedProbe() {
  const opacity = useRef(new Animated.Value(0.1)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {toValue: 1, duration: 800, useNativeDriver: true}),
        Animated.timing(opacity, {toValue: 0.1, duration: 800, useNativeDriver: true}),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View style={{flex: 1, padding: 32, gap: 18, backgroundColor: '#fff'}}>
      <Text style={{fontSize: 20, color: '#111'}}>Native animated opacity probe</Text>
      <Animated.View
        testID="native-animated-opacity"
        accessibilityLabel="Native opacity animation"
        style={{width: 180, height: 64, opacity, backgroundColor: '#3b82f6'}}
      />
      <View testID="static-sibling" style={{width: 180, height: 64, backgroundColor: '#10b981'}} />
    </View>
  );
}

AppRegistry.registerComponent('NativeAnimatedProbe', () => NativeAnimatedProbe);
