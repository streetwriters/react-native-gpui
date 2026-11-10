import React from 'react';
import { ScrollView, Text, View } from 'react-native';

export default function HoverRowsFixture() {
  return (
    <View style={{ padding: 8 }}>
      <ScrollView
        testID="hover-rows-scroll"
        style={{ height: 300, width: 300 }}
      >
        {Array.from({ length: 80 }, (_, index) => (
          <View
            key={index}
            testID={`hover-row-${index}`}
            hoverStyle={{ backgroundColor: '#ffeecc' }}
            style={{ height: 30, backgroundColor: '#ffffff', padding: 4 }}
          >
            <View style={{ flexDirection: 'row' }}>
              <Text>{`row ${index}`}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View testID="hover-rows-empty" style={{ height: 80, width: 300 }} />
      <View style={{ position: 'absolute', left: 340, top: 8, width: 200 }}>
        {Array.from({ length: 10 }, (_, index) => (
          <View
            key={index}
            testID={`hover-static-${index}`}
            hoverStyle={{ backgroundColor: '#ccddff' }}
            style={{ height: 30, backgroundColor: '#ffffff' }}
          >
            <Text>{`static ${index}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
