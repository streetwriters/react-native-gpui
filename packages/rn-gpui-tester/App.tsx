import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { findScreen, screens } from './screenCatalog';
import { renderScreen } from './fixtures/screens';

export default function TesterApp({
  screen = 'overview',
  testMode = false,
}: {
  screen?: string;
  testMode?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(() => findScreen(screen).id);
  const selected = findScreen(selectedId);
  let previousGroup = '';
  return (
    <View testID="tester-app" style={styles.app}>
      <View testID="tester-menu" style={styles.sidebar}>
        <Text style={styles.brand}>RN GPUI</Text>
        <Text style={styles.subtitle}>TESTER</Text>
        <ScrollView style={{ flex: 1 }}>
          {screens.map(item => {
            const showGroup = item.group !== previousGroup;
            previousGroup = item.group;
            const active = item.id === selectedId;
            return (
              <View key={item.id}>
                {showGroup ? (
                  <Text style={styles.group}>{item.group}</Text>
                ) : null}
                <Pressable
                  testID={`tester-menu-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelectedId(item.id)}
                  style={[styles.menuItem, active && styles.activeItem]}
                >
                  <Text style={[styles.menuText, active && styles.activeText]}>
                    {item.title}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.main}>
        <View style={styles.header}>
          <Text testID="tester-active-screen" style={styles.heading}>
            {selected.title}
          </Text>
          <Text style={styles.screenId}>{selected.id}</Text>
        </View>
        <View
          key={selected.id}
          testID={`tester-screen-${selected.id}`}
          style={styles.content}
        >
          {renderScreen[selected.id]({ testMode })}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  app: { flex: 1, flexDirection: 'row', backgroundColor: '#171923' },
  sidebar: {
    width: 250,
    backgroundColor: '#10131d',
    borderRightWidth: 1,
    borderColor: '#2b3143',
    padding: 14,
  },
  brand: { color: '#fff', fontWeight: '800', fontSize: 23 },
  subtitle: {
    color: '#8290b1',
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 18,
  },
  group: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8492ae',
    marginTop: 18,
    marginBottom: 7,
    paddingLeft: 10,
  },
  menuItem: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 6,
    marginBottom: 2,
  },
  activeItem: { backgroundColor: '#2a3352' },
  menuText: { fontSize: 14, color: '#bdc7de' },
  activeText: { color: '#fff', fontWeight: '600' },
  main: { flex: 1 },
  header: {
    height: 64,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#2b3143',
  },
  heading: { color: '#fff', fontSize: 21, fontWeight: '700' },
  screenId: { color: '#8492ae', fontSize: 13 },
  content: { flex: 1 },
});
