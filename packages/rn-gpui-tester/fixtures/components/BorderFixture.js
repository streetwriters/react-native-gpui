import React from 'react';
import { ScrollView, Text, View } from 'react-native';
function BorderFixture() {
  return (
    <View
      style={{
        flex: 1,
        padding: 32,
        gap: 24,
        backgroundColor: '#fff',
      }}
    >
      <Text
        style={{
          fontSize: 20,
          color: '#111',
        }}
      >
        Per-edge border and outline probe
      </Text>
      <View
        testID="per-side-solid"
        style={{
          width: 240,
          height: 80,
          borderTopWidth: 4,
          borderRightWidth: 8,
          borderBottomWidth: 3,
          borderLeftWidth: 6,
          borderTopColor: '#ef4444',
          borderRightColor: '#22c55e',
          borderBottomColor: '#3b82f6',
          borderLeftColor: '#a855f7',
          borderRadius: 12,
        }}
      />
      <View
        testID="dashed-border"
        style={{
          width: 240,
          height: 72,
          borderWidth: 3,
          borderStyle: 'dashed',
          borderColor: '#111',
        }}
      />
      <View
        testID="dotted-outline"
        style={{
          width: 240,
          height: 72,
          borderWidth: 1,
          borderColor: '#888',
          outlineWidth: 3,
          outlineOffset: 4,
          outlineStyle: 'dotted',
          outlineColor: '#f97316',
        }}
      />
      <View style={{ flexDirection: 'row', gap: 24 }}>
        <View
          testID="rounded-clip"
          style={{
            width: 120,
            height: 80,
            borderRadius: 24,
            overflow: 'hidden',
          }}
        >
          <View style={{ flex: 1, backgroundColor: '#ef4444' }} />
        </View>
        <ScrollView
          testID="rounded-scroll"
          style={{ width: 120, height: 80, flexGrow: 0, borderRadius: 24 }}
        >
          <View style={{ height: 400, backgroundColor: '#2563eb' }} />
        </ScrollView>
      </View>
    </View>
  );
}
export default BorderFixture;
