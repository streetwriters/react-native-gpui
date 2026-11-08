/**
 * A row inside wrappers of a column must stretch to the column's width, with
 * and without drag and drop props on the wrapper.
 *
 * @format
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

function Row({
  id,
  extra,
  style,
}: {
  id: string;
  extra?: object;
  style?: object;
}) {
  return (
    <Pressable
      testID={`${id}-item`}
      droppable
      onPress={() => {}}
      {...extra}
      style={{
        ...style,
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

const VARIANTS: [string, object, object][] = [
  ['display', {}, { display: 'flex' }],
  ['hover', { hoverStyle: { backgroundColor: '#eee' } }, {}],
  ['dragover', { dragOverStyle: { backgroundColor: '#eee' } }, {}],
  ['tooltip', { tooltip: 'tip' }, {}],
  ['context', { onContextMenu: () => {} }, {}],
  ['group', { group: 'g' }, {}],
  ['bg', {}, { backgroundColor: 'transparent', borderRadius: 4 }],
];

export default function StretchFixture() {
  const [wide, setWide] = useState(false);
  return (
    <View>
      <Pressable testID="stretch-widen" onPress={() => setWide(true)}>
        <Text>Widen</Text>
      </Pressable>
      <ScrollView style={{ width: wide ? 300 : 120, height: 400 }}>
        <View testID="stretch-column" style={{ paddingHorizontal: 10 }}>
          {VARIANTS.map(([id, extra, style]) => (
            <View
              key={id}
              testID={`${id}-wrapper`}
              style={{ flexDirection: 'column' }}
            >
              <View style={{ opacity: 1 }}>
                <Row id={id} extra={extra} style={style} />
              </View>
            </View>
          ))}
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
    </View>
  );
}
