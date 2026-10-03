import React from 'react';
import { AppRegistry, Text, View, useWindowDimensions } from 'react-native';

function DimensionsProbe() {
  const { width, height, scale, fontScale } = useWindowDimensions();
  return (
    <View style={{ flex: 1, padding: 32, gap: 12, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 20, color: '#111' }}>
        GPUI window dimensions
      </Text>
      <Text testID="window-width">width: {width}</Text>
      <Text testID="window-height">height: {height}</Text>
      <Text>scale: {scale}×</Text>
      <Text>font scale: {fontScale}×</Text>
      <Text style={{ color: '#666' }}>
        Resize the window; dimensions should update.
      </Text>
    </View>
  );
}

AppRegistry.registerComponent('DimensionsProbe', () => DimensionsProbe);

export default DimensionsProbe;
