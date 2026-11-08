/**
 * A one-line text in a box exactly as wide as the text is measured must not be
 * cut short with an ellipsis.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

const TITLES = [
  'Travel itinerary',
  'Meeting notes',
  'Project plan for the next quarter',
  'Book recommendations',
  'Recipe: lentil soup',
  'Grocery list',
];
const WEIGHTS = ['400', '600', '800'] as const;
const SIZES = [13, 14, 15, 16, 17.5];

export default function EllipsisFixture() {
  return (
    <View style={{ padding: 16, gap: 4 }}>
      {TITLES.flatMap((title, row) =>
        WEIGHTS.flatMap(weight =>
          SIZES.map(size => (
            <View
              key={`${row}-${weight}-${size}`}
              style={{ flexDirection: 'row', gap: 12 }}
            >
              <View
                testID={`cut-${row}-${weight}-${size}`}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    fontFamily: 'Inter',
                    fontSize: size,
                    fontWeight: weight,
                  }}
                >
                  {title}
                </Text>
              </View>
              <View
                testID={`full-${row}-${weight}-${size}`}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text
                  style={{
                    fontFamily: 'Inter',
                    fontSize: size,
                    fontWeight: weight,
                  }}
                >
                  {title}
                </Text>
              </View>
            </View>
          )),
        ),
      )}
    </View>
  );
}
