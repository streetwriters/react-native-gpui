/**
 * Dragging the scroll bar thumb of a ScrollView, a FlatList and a nested
 * scroll view, with and without handlers.
 *
 * @format
 */

import React, { useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';

const ROWS = Array.from({ length: 60 }, (_, index) => index);

function Row({ index }: { index: number }) {
  return (
    <View style={{ height: 30, backgroundColor: index % 2 ? '#ddd' : '#eee' }}>
      <Text>{`row ${index}`}</Text>
    </View>
  );
}

export default function ScrollBarDragFixture() {
  const [log, setLog] = useState<string[]>([]);
  const note = (name: string, y: number) =>
    setLog(previous =>
      previous[previous.length - 1]?.startsWith(name) && name === 'drag'
        ? previous
        : [...previous, `${name}:${Math.round(y)}`],
    );
  return (
    <View style={{ flexDirection: 'row', gap: 16, padding: 16 }}>
      <View>
        <Text testID="bar-log">{log.join(' ')}</Text>
        <ScrollView
          testID="drag-plain"
          style={{ width: 200, height: 240 }}
          onScrollBarDragStart={event =>
            note('start', event.nativeEvent.contentOffset.y)
          }
          onScrollBarDrag={event =>
            note('drag', event.nativeEvent.contentOffset.y)
          }
          onScrollBarDragEnd={event =>
            note('end', event.nativeEvent.contentOffset.y)
          }
        >
          {ROWS.map(index => (
            <Row key={index} index={index} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        testID="drag-flat"
        style={{ width: 200, height: 240 }}
        data={ROWS}
        keyExtractor={index => String(index)}
        renderItem={({ item }) => <Row index={item} />}
      />
      <ScrollView testID="drag-outer" style={{ width: 200, height: 240 }}>
        <Text>Outer header</Text>
        <ScrollView
          testID="drag-inner"
          nestedScrollEnabled
          style={{ height: 150, marginRight: 24 }}
        >
          {ROWS.map(index => (
            <Row key={index} index={index} />
          ))}
        </ScrollView>
        {ROWS.slice(0, 20).map(index => (
          <Row key={index} index={index} />
        ))}
      </ScrollView>
    </View>
  );
}
