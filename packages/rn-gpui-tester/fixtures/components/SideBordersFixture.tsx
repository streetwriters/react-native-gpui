/**
 * Borders set on one side or two, with different widths and colors per side.
 *
 * @format
 */

import React from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

const box = { width: 100, height: 50, backgroundColor: '#ffffff' };

export default function SideBordersFixture() {
  return (
    <View
      style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
    >
      <View
        testID="border-bottom"
        style={{ ...box, borderBottomWidth: 4, borderBottomColor: '#ff0000' }}
      />
      <View
        testID="border-bottom-solid"
        style={{
          ...box,
          borderBottomWidth: 4,
          borderBottomColor: '#ff0000',
          borderStyle: 'solid',
        }}
      />
      <View
        testID="border-top-left"
        style={{
          ...box,
          borderTopWidth: 4,
          borderTopColor: '#ff0000',
          borderLeftWidth: 8,
          borderLeftColor: '#0000ff',
        }}
      />
      <View
        testID="border-right"
        style={{ ...box, borderRightWidth: 6, borderRightColor: '#00aa00' }}
      />
      <View
        testID="border-bottom-radius"
        style={{
          ...box,
          borderRadius: 12,
          borderBottomWidth: 4,
          borderBottomColor: '#ff0000',
        }}
      />
      <View
        testID="border-bottom-dashed"
        style={{
          ...box,
          borderBottomWidth: 4,
          borderBottomColor: '#ff0000',
          borderStyle: 'dashed',
        }}
      />
      <View
        testID="border-color-only-bottom-width"
        style={{
          ...box,
          borderColor: '#ff0000',
          borderBottomWidth: 4,
        }}
      />
      <View
        testID="border-short-hex"
        style={{ ...box, borderBottomWidth: 4, borderBottomColor: '#ddd' }}
      />
      <View
        testID="border-rgba"
        style={{
          ...box,
          borderBottomWidth: 4,
          borderBottomColor: 'rgba(0,0,0,0.5)',
        }}
      />
      <View style={{ width: 100, gap: 4, flexShrink: 1 }}>
        <Pressable
          testID="border-flex-gap"
          hoverStyle={{ backgroundColor: '#eeeeee' }}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            gap: 4,
            borderBottomWidth: 1,
            borderBottomColor: '#ff0000',
            borderLeftWidth: 2,
            borderLeftColor: 'transparent',
          }}
        >
          <View style={{ height: 20, backgroundColor: '#ffffff' }} />
        </Pressable>
      </View>
      <Pressable
        testID="border-pressable"
        style={{
          ...box,
          borderBottomWidth: 1,
          borderBottomColor: '#ff0000',
          borderLeftWidth: 2,
          borderLeftColor: 'transparent',
        }}
      />
      <View
        testID="border-hairline"
        style={{
          ...box,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#ff0000',
        }}
      />
      <View style={{ width: 100, height: 60 }}>
        <ScrollView>
          <View
            testID="border-in-scroll"
            style={{
              ...box,
              borderBottomWidth: 4,
              borderBottomColor: '#ff0000',
            }}
          />
          <View style={box} />
          <View style={box} />
        </ScrollView>
      </View>
      <View style={{ width: 100, height: 60 }}>
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={item => String(item)}
          renderItem={({ item }) => (
            <View
              testID={`border-in-list-${item}`}
              style={{
                ...box,
                borderBottomWidth: 4,
                borderBottomColor: '#ff0000',
              }}
            />
          )}
        />
      </View>
    </View>
  );
}
