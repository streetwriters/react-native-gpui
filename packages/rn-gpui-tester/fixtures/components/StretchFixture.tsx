/**
 * A row inside wrappers of a column must stretch to the column's width, with
 * and without drag and drop props on the wrapper.
 *
 * @format
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

function Row({ id }: { id: string }) {
  return (
    <Pressable
      testID={`${id}-item`}
      droppable
      onPress={() => {}}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        paddingVertical: 6,
      }}
    >
      <View
        testID={`${id}-inner`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
      >
        <View style={{ width: 13, height: 13, backgroundColor: '#3b82f6' }} />
        <Text
          testID={`${id}-title`}
          numberOfLines={1}
          style={{ marginLeft: 6 }}
        >
          A navigation item title
        </Text>
      </View>
    </Pressable>
  );
}

export default function StretchFixture() {
  return (
    <ScrollView style={{ width: 300, height: 400 }}>
      <View testID="stretch-column" style={{ paddingHorizontal: 10 }}>
        <View testID="plain-wrapper" style={{ flexDirection: 'column' }}>
          <View style={{ opacity: 1 }}>
            <Row id="plain" />
          </View>
        </View>
        <View
          testID="drag-wrapper"
          draggable
          droppable
          onDragStart={() => {}}
          style={{ flexDirection: 'column' }}
        >
          <View style={{ opacity: 1 }}>
            <Row id="drag" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
