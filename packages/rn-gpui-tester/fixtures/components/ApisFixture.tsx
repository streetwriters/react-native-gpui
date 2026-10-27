import React from 'react';
import {
  I18nManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  DesktopWindow,
  useWindowFocus,
  useWindowState,
} from '@react-native-gpui/core/desktop';

export default function ApisFixture() {
  const focused = useWindowFocus();
  const windowState = useWindowState();
  return (
    <ScrollView testID="apis-fixture" contentContainerStyle={styles.content}>
      <Text style={styles.title}>Core APIs</Text>
      <View style={styles.section}>
        <Text style={styles.heading}>Platform</Text>
        <Text testID="platform-version">{String(Platform.Version)}</Text>
        <Text testID="platform-is-testing">{String(Platform.isTesting)}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Window hooks</Text>
        <Text testID="window-focus">{String(focused)}</Text>
        <Text testID="window-width">
          {String(Math.round(windowState?.bounds.width ?? -1))}
        </Text>
        <Pressable
          testID="window-open-child"
          onPress={() =>
            DesktopWindow.open({
              component: 'DesktopShellChild',
              width: 420,
              height: 300,
            })
          }
        >
          <Text>Open child window</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>I18nManager</Text>
        <Text testID="i18n-is-rtl">{String(I18nManager.isRTL)}</Text>
        <Pressable
          testID="i18n-force-rtl"
          onPress={() => I18nManager.forceRTL(true)}
        >
          <Text>Force RTL</Text>
        </Pressable>
        <Pressable
          testID="i18n-reset-rtl"
          onPress={() => I18nManager.forceRTL(false)}
        >
          <Text>Reset RTL</Text>
        </Pressable>
        <View style={styles.row}>
          <View testID="i18n-box-a" style={styles.box} />
          <View testID="i18n-box-b" style={styles.box} />
          <View testID="i18n-box-c" style={[styles.box, { marginStart: 40 }]} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 32, gap: 16, backgroundColor: '#fff' },
  title: { fontSize: 20, color: '#111' },
  section: { gap: 8 },
  heading: { fontSize: 16, color: '#333' },
  row: { flexDirection: 'row' },
  box: { width: 30, height: 30, backgroundColor: '#36c' },
});
