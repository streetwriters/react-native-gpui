import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ContextMenu } from '@react-native-gpui/core/desktop';
import type { MenuItemSpec } from '@react-native-gpui/core/desktop';

const items: MenuItemSpec[] = Array.from({ length: 50 }, (_, index) => ({
  id: `long-${index}`,
  label: `Item ${index}`,
}));

export default function LongMenuFixture() {
  const [chosen, setChosen] = useState('none');
  return (
    <View style={{ padding: 8 }}>
      <Text testID="long-menu-chosen">{chosen}</Text>
      <Pressable
        testID="long-menu-open"
        onPress={() => {
          ContextMenu.show(items, { presentation: 'custom', x: 20, y: 20 })
            .then(id => setChosen(String(id)))
            .catch(error => setChosen(`failed ${String(error)}`));
        }}
      >
        <Text>Open</Text>
      </Pressable>
    </View>
  );
}
