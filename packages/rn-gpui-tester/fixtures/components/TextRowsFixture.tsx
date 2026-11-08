/**
 * List rows whose heights are fractional, as a browser lays them out, to see
 * where text lands on the device pixel grid.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

const BODY =
  'A short body of text that continues for a few words so the list shows a headline under the title.';

const ROWS = [
  { title: 'Meeting notes', height: 132.40625, top: 35, lines: 2 },
  { title: 'Grocery list', height: 107.40625, top: 10, lines: 2 },
  {
    title: 'Project plan for the next quarter',
    height: 126.609375,
    top: 10,
    lines: 3,
  },
  { title: 'Travel itinerary', height: 132.40625, top: 35, lines: 2 },
];

export default function TextRowsFixture() {
  return (
    <View testID="rows" style={{ backgroundColor: '#ffffff' }}>
      <View style={{ width: 349, flexDirection: 'row', alignItems: 'center' }}>
        <Text
          testID="truncated-title"
          numberOfLines={1}
          style={{
            minWidth: 0,
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          A very long note title that keeps going well past the width of the
          list pane
        </Text>
      </View>
      <View style={{ width: 349, flexDirection: 'row', alignItems: 'center' }}>
        <Text
          testID="truncated-token"
          numberOfLines={1}
          style={{
            minWidth: 0,
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          supercalifragilisticexpialidocioussupercalifragilisticexpialidocioussupercalifragilistic
        </Text>
      </View>
      <View style={{ width: 349, flexDirection: 'row', alignItems: 'center' }}>
        <Text
          testID="short-title"
          numberOfLines={1}
          style={{
            minWidth: 0,
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          Short title
        </Text>
      </View>
      <Text
        testID="fallback-title"
        numberOfLines={1}
        style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: '600' }}
      >
        Accents and symbols: café, naïve, 日本語, emoji 🙂
      </Text>
      <Text
        testID="highlight"
        style={{ fontFamily: 'Inter', fontSize: 13, color: '#000000' }}
      >
        A short{' '}
        <Text
          testID="highlight-span"
          style={{ backgroundColor: '#ff0000', color: '#ffffff' }}
        >
          body
        </Text>{' '}
        of text
      </Text>
      {ROWS.map((row, index) => (
        <View
          key={row.title}
          testID={`row-${index}`}
          style={{
            height: row.height,
            paddingLeft: 15,
            paddingTop: row.top,
            width: 379,
          }}
        >
          <Text
            testID={`row-title-${index}`}
            numberOfLines={1}
            style={{
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: '600',
              color: '#181818',
            }}
          >
            {row.title}
          </Text>
          <Text
            testID={`row-body-${index}`}
            numberOfLines={4}
            style={{
              marginTop: 7,
              width: 349,
              fontFamily: 'Inter',
              fontSize: 13,
              lineHeight: 19.2,
              color: '#474747',
            }}
          >
            {`${row.title}. ${BODY}${index === 2 ? ' It ends.' : ''}`}
          </Text>
        </View>
      ))}
    </View>
  );
}
