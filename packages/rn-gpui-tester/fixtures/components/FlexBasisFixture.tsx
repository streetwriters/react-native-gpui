/**
 * A row item with an inner row that grows from a basis of nothing, inside the
 * row wrappers of the app's real chain: how wide is the item?
 *
 * @format
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

const INNER: [string, object][] = [
  ['flex', { flex: 1 }],
  ['points', { flexGrow: 1, flexShrink: 1, flexBasis: 0 }],
  ['percent', { flexGrow: 1, flexShrink: 1, flexBasis: '0%' }],
  ['auto', { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' }],
];

function Item({ id, inner }: { id: string; inner: object }) {
  return (
    <View
      testID={`${id}-outer`}
      style={{ flexDirection: 'row', backgroundColor: '#eee' }}
    >
      <View style={{ flexDirection: 'row', opacity: 1 }}>
        <Pressable
          testID={`${id}-item`}
          onPress={() => {}}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          <View
            testID={`${id}-inner`}
            style={{ ...inner, flexDirection: 'row', alignItems: 'center' }}
          >
            <View
              style={{ width: 13, height: 13, backgroundColor: '#3b82f6' }}
            />
            <Text
              testID={`${id}-title`}
              numberOfLines={1}
              style={{ marginLeft: 6 }}
            >
              A navigation item title
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function FlexBasisFixture() {
  return (
    <ScrollView style={{ width: 400, height: 400 }}>
      <View testID="basis-column">
        {INNER.map(([id, inner]) => (
          <Item key={id} id={id} inner={inner} />
        ))}
      </View>
    </ScrollView>
  );
}
