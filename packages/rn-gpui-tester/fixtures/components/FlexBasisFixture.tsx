/**
 * A row item with an inner row that grows from a basis of nothing, inside the
 * row wrappers of the app's real chain: how wide is the item? With text, and
 * with a box of a fixed width, which a browser measures exactly.
 *
 * @format
 */

import React from 'react';
import {
  experimental_LayoutConformance as LayoutConformance,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

const INNER: [string, object][] = [
  ['flex', { flex: 1 }],
  ['points', { flexGrow: 1, flexShrink: 1, flexBasis: 0 }],
  ['percent', { flexGrow: 1, flexShrink: 1, flexBasis: '0%' }],
  ['auto', { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' }],
];

function Item({
  id,
  inner,
  box,
}: {
  id: string;
  inner: object;
  box?: boolean;
}) {
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
            {box ? (
              <View
                testID={`${id}-title`}
                style={{
                  width: 140,
                  height: 14,
                  marginLeft: 6,
                  backgroundColor: '#999',
                }}
              />
            ) : (
              <Text
                testID={`${id}-title`}
                numberOfLines={1}
                style={{ marginLeft: 6 }}
              >
                A navigation item title
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function FlexBasisFixture({ strict }: { strict?: boolean }) {
  const rows = (
    <ScrollView style={{ width: 400, height: 400 }}>
      <View testID="basis-column">
        {INNER.map(([id, inner]) => (
          <Item key={id} id={id} inner={inner} />
        ))}
        {INNER.map(([id, inner]) => (
          <Item key={id} id={`box-${id}`} inner={inner} box />
        ))}
      </View>
    </ScrollView>
  );
  return strict ? (
    <LayoutConformance mode="strict">{rows}</LayoutConformance>
  ) : (
    rows
  );
}
