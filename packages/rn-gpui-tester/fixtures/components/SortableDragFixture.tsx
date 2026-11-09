import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { DragDrop } from '@react-native-gpui/core/desktop';

export default function SortableDragFixture() {
  const [items, setItems] = useState(['one', 'two', 'three']);
  const [returned, setReturned] = useState('');
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text testID="sortable-order">{items.join(',')}</Text>
      <Text testID="sortable-returned">{returned}</Text>
      {items.map(item => (
        <View
          key={item}
          testID={`sortable-${item}`}
          draggable
          droppable
          onDragStart={() => {
            DragDrop.setPayload({ id: item });
          }}
          onDrop={() => {
            const payload = DragDrop.getPayload<{ id: string }>();
            if (!payload || payload.id === item) return;
            setItems(current => {
              const next = current.filter(entry => entry !== payload.id);
              next.splice(current.indexOf(item), 0, payload.id);
              return next;
            });
          }}
          style={{ height: 40, backgroundColor: '#ddd' }}
        >
          <View style={{ flexDirection: 'row', padding: 4 }}>
            <Text>{item}</Text>
          </View>
        </View>
      ))}
      <View
        testID="sortable-returns"
        draggable
        droppable
        onDragStart={() => ({ id: 'returned' }) as never}
        onDrop={() =>
          setReturned(JSON.stringify(DragDrop.getPayload() ?? null))
        }
        style={{ height: 40, backgroundColor: '#fc8' }}
      >
        <Text>returns payload</Text>
      </View>
    </View>
  );
}
