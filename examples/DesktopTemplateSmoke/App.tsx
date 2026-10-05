import React from 'react';
import { View } from 'react-native';
import ReanimatedDemo from './ReanimatedDemo';
export default function App() {
  return (
    <View testID="desktop-app-root" style={{ flex: 1 }}>
      <ReanimatedDemo />
    </View>
  );
}
