import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ContextMenu,
  TitleBar,
  type MenuItemSpec,
} from '@react-native-gpui/core/desktop';
import { findScreen, screens } from './screenCatalog';
import { renderScreen } from './fixtures/screens';

/** macOS has its own menu bar, so only the other platforms get the button. */
const showMenuButton = Platform.OS !== 'macos';

/** The application menu, opened from the title bar's button. */
const APP_MENU: MenuItemSpec[] = [
  {
    type: 'submenu',
    label: 'File',
    items: [
      { id: 'file-new', label: 'New' },
      { id: 'file-open', label: 'Open…' },
      { type: 'separator' },
      { id: 'file-close', label: 'Close window' },
    ],
  },
  {
    type: 'submenu',
    label: 'Edit',
    items: [
      { id: 'edit-undo', label: 'Undo' },
      { id: 'edit-redo', label: 'Redo' },
      { type: 'separator' },
      { id: 'edit-cut', label: 'Cut' },
      { id: 'edit-copy', label: 'Copy' },
      { id: 'edit-paste', label: 'Paste' },
    ],
  },
  {
    type: 'submenu',
    label: 'Help',
    items: [
      { id: 'help-docs', label: 'Documentation' },
      { id: 'help-about', label: 'About RN GPUI Tester' },
    ],
  },
];

export default function TesterApp({
  screen = 'overview',
  testMode = false,
}: {
  screen?: string;
  testMode?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(() => findScreen(screen).id);
  const [menuChoice, setMenuChoice] = useState<string | null>(null);
  const [menuHovered, setMenuHovered] = useState(false);
  const selected = findScreen(selectedId);
  let previousGroup = '';
  const openMenu = (event: {
    nativeEvent: { pageX: number; pageY: number };
  }) => {
    const { pageX, pageY } = event.nativeEvent;
    void ContextMenu.show(APP_MENU, { x: pageX, y: pageY }).then(id => {
      if (id != null) setMenuChoice(id);
    });
  };
  return (
    <View testID="tester-app" style={styles.window}>
      <TitleBar style={styles.titleBar}>
        {showMenuButton ? (
          <Pressable
            testID="titlebar-menu"
            accessibilityRole="button"
            accessibilityLabel="Application menu"
            onPress={openMenu}
            onHoverIn={() => setMenuHovered(true)}
            onHoverOut={() => setMenuHovered(false)}
            style={({ pressed }) => [
              styles.menuButton,
              menuHovered && styles.menuButtonHovered,
              pressed && styles.menuButtonPressed,
            ]}
          >
            <Text style={styles.menuGlyph}>{'☰'}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.barTitle}>RN GPUI Tester</Text>
        {menuChoice != null ? (
          <Text testID="titlebar-menu-choice" style={styles.barHint}>
            {menuChoice}
          </Text>
        ) : null}
      </TitleBar>
      <View style={styles.app}>
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
                    <Text
                      style={[styles.menuText, active && styles.activeText]}
                    >
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
    </View>
  );
}
const styles = StyleSheet.create({
  window: { flex: 1, backgroundColor: '#171923' },
  // The sidebar's color, so the bar reads as one piece with the app.
  titleBar: {
    backgroundColor: '#10131d',
    borderBottomWidth: 1,
    borderColor: '#2b3143',
  },
  menuButton: {
    marginLeft: 8,
    width: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  menuButtonHovered: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  menuButtonPressed: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  menuGlyph: { fontSize: 16, color: '#e6e9f2' },
  barTitle: { fontSize: 13, fontWeight: '600', color: '#e6e9f2' },
  barHint: { fontSize: 12, color: '#8290b1' },
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
