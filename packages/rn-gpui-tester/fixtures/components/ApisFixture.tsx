import React, { useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Dimensions,
  I18nManager,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  DesktopWindow,
  useDesktopWindow,
  useWindowFocus,
  useWindowState,
} from '@react-native-gpui/core/desktop';

export default function ApisFixture() {
  const [appStates, setAppStates] = useState<string[]>([
    String(AppState.currentState),
  ]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next =>
      setAppStates(previous => [...previous, next]),
    );
    return () => subscription.remove();
  }, []);
  const [alertResult, setAlertResult] = useState('none');
  const [linkResult, setLinkResult] = useState('none');
  const currentWindow = useDesktopWindow();
  const dimensions = useWindowDimensions();
  const screen = Dimensions.get('screen');
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
        <Text style={styles.heading}>Dimensions</Text>
        <Text testID="dimensions-window-width">
          {String(Math.round(dimensions.width))}
        </Text>
        <Text testID="dimensions-screen">
          {Math.round(screen.width)}x{Math.round(screen.height)}
        </Text>
        <Text testID="dimensions-font-scale">
          {String(dimensions.fontScale)}
        </Text>
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
        <Text style={styles.heading}>Linking</Text>
        <Text testID="link-result">{linkResult}</Text>
        <Pressable
          testID="link-can-open"
          onPress={async () => {
            const known = await Linking.canOpenURL('https://example.com');
            const unknown = await Linking.canOpenURL(
              'rngpui-no-such-scheme-zzz://x',
            );
            setLinkResult(`known:${known},unknown:${unknown}`);
          }}
        >
          <Text>canOpenURL</Text>
        </Pressable>
        <Pressable
          testID="link-open-settings"
          onPress={() =>
            Linking.openSettings().then(
              () => setLinkResult('settings:opened'),
              error => setLinkResult(`settings:${error.message}`),
            )
          }
        >
          <Text>openSettings</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Alert</Text>
        <Text testID="alert-result">{alertResult}</Text>
        <Pressable
          testID="alert-buttons"
          onPress={() =>
            Alert.alert('Title', 'Body', [
              { text: 'First', onPress: () => setAlertResult('first') },
              { text: 'Second', onPress: () => setAlertResult('second') },
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setAlertResult('cancel'),
              },
            ])
          }
        >
          <Text>Alert with buttons</Text>
        </Pressable>
        <Pressable
          testID="alert-plain"
          onPress={() =>
            Alert.alert('Plain', undefined, [
              { text: 'OK', onPress: () => setAlertResult('ok') },
            ])
          }
        >
          <Text>Alert, not cancelable</Text>
        </Pressable>
        <Pressable
          testID="alert-cancelable"
          onPress={() =>
            Alert.alert(
              'Cancelable',
              undefined,
              [{ text: 'OK', onPress: () => setAlertResult('ok') }],
              {
                cancelable: true,
                onDismiss: () => setAlertResult('dismissed'),
              },
            )
          }
        >
          <Text>Alert, cancelable</Text>
        </Pressable>
        <Pressable
          testID="prompt-plain"
          onPress={() =>
            Alert.prompt(
              'Name',
              undefined,
              text => setAlertResult(`text:${text}`),
              'plain-text',
              'Ada',
            )
          }
        >
          <Text>Prompt</Text>
        </Pressable>
        <Pressable
          testID="prompt-secure"
          onPress={() =>
            Alert.prompt(
              'Secret',
              undefined,
              text => setAlertResult(`secret:${text}`),
              'secure-text',
            )
          }
        >
          <Text>Secure prompt</Text>
        </Pressable>
        <Pressable
          testID="prompt-login"
          onPress={() =>
            Alert.prompt(
              'Sign in',
              undefined,
              (credentials: unknown) =>
                setAlertResult(`login:${JSON.stringify(credentials)}`),
              'login-password',
            )
          }
        >
          <Text>Login prompt</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>AppState</Text>
        <Text testID="appstate-current">{String(AppState.currentState)}</Text>
        <Text testID="appstate-log">{appStates.join(',')}</Text>
        <Pressable
          testID="appstate-hide"
          onPress={() => {
            currentWindow.hide();
            setTimeout(() => currentWindow.show(), 600);
          }}
        >
          <Text>Hide briefly</Text>
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
  content: {
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  title: { fontSize: 20, color: '#111', width: '100%' },
  section: { gap: 6, width: 300 },
  heading: { fontSize: 16, color: '#333' },
  row: { flexDirection: 'row' },
  box: { width: 30, height: 30, backgroundColor: '#36c' },
});
