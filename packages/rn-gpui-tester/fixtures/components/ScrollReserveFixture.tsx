import React from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { ScrollBar } from '@react-native-gpui/core/desktop';

const data = Array.from({ length: 60 }, (_, index) => index);

export default function ScrollReserveFixture() {
  return (
    <View style={{ padding: 16, gap: 8, flexDirection: 'row' }}>
      <ScrollView testID="reserve-custom" style={{ height: 200, width: 200 }}>
        <View style={{ height: 600 }} />
        <ScrollBar thickness={20} />
      </ScrollView>
      <FlatList
        testID="reserve-list"
        style={{ height: 200, width: 200 }}
        data={data}
        keyExtractor={item => String(item)}
        renderItem={({ item }) => (
          <View testID={`reserve-row-${item}`} style={{ height: 40 }}>
            <Text>{`row ${item}`}</Text>
          </View>
        )}
      />
      <ScrollView testID="reserve-outer" style={{ height: 200, width: 200 }}>
        <ScrollView testID="reserve-inner" style={{ height: 150 }}>
          <View style={{ height: 600 }} />
        </ScrollView>
        <View style={{ height: 600 }} />
      </ScrollView>
    </View>
  );
}
