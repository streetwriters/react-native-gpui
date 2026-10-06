import React from 'react';
import { Text, View } from 'react-native';
import { screens } from '../../screenCatalog';
export default function OverviewFixture() {
  return (
    <View
      testID="tester-overview"
      style={{ flex: 1, padding: 36, gap: 18, backgroundColor: '#171923' }}
    >
      <Text style={{ color: '#fff', fontSize: 34, fontWeight: '700' }}>
        React Native GPUI Tester
      </Text>
      <Text style={{ color: '#bac5db', fontSize: 18 }}>
        Choose a test screen from the menu.
      </Text>
      <Text style={{ color: '#8ce6bc', fontSize: 18 }}>
        {screens.length - 1} screens for views, input, animation, navigation and
        native modules.
      </Text>
    </View>
  );
}
