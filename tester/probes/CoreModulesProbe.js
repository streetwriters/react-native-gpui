import React, {useState} from 'react';
import {Alert, Appearance, Dimensions, Linking, Text, View, useColorScheme} from 'react-native';
import NativeClipboard from 'react-native/Libraries/Components/Clipboard/NativeClipboard';

const styles = {
  page: {padding: 24, gap: 12, backgroundColor: '#f4f5f7', flex: 1},
  heading: {fontSize: 22, fontWeight: '700', color: '#18212f'},
  row: {padding: 12, backgroundColor: '#fff', borderRadius: 8, color: '#243247'},
  button: {padding: 12, backgroundColor: '#dce9ff', borderRadius: 8, color: '#164a9b'},
};

function CoreModulesProbe() {
  const [scheme, setScheme] = useState(Appearance.getColorScheme() || 'unknown');
  const hookScheme = useColorScheme();
  const [viewport, setViewport] = useState(Dimensions.get('window'));
  const [linkResult, setLinkResult] = useState('not checked');
  const [clipboardResult, setClipboardResult] = useState(
    NativeClipboard ? 'available' : 'module unavailable',
  );

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>Core modules</Text>
      <Text style={styles.row}>Appearance: {scheme}</Text>
      <Text style={styles.row}>useColorScheme: {hookScheme || 'unknown'}</Text>
      <Text style={styles.button} onPress={() => {
        const next = scheme === 'dark' ? 'light' : 'dark';
        Appearance.setColorScheme(next);
        setScheme(Appearance.getColorScheme() || next);
      }}>Toggle color scheme</Text>
      <Text style={styles.row}>Dimensions: {Math.round(viewport.width)} × {Math.round(viewport.height)}</Text>
      <Text style={styles.button} onPress={() => setViewport(Dimensions.get('window'))}>Refresh dimensions</Text>
      <Text style={styles.button} onPress={() => Alert.alert('GPUI alert', 'AlertManager is connected.', [{text: 'Cancel', style: 'cancel'}, {text: 'OK', onPress: () => setLinkResult('alert callback fired')}])}>Show alert</Text>
      <Text style={styles.button} onPress={async () => {
        try {
          setLinkResult(`HTTPS supported: ${await Linking.canOpenURL('HTTPS://example.com')}`);
        } catch (error) {
          setLinkResult(String(error));
        }
      }}>Check https link</Text>
      <Text style={styles.row}>Linking: {linkResult}</Text>
      <Text style={styles.row}>Clipboard: {clipboardResult}</Text>
      <Text style={styles.button} onPress={async () => {
        const clipboard = NativeClipboard;
        if (!clipboard) return setClipboardResult('module unavailable');
        await clipboard.setString('GPUI clipboard probe');
        setClipboardResult(await clipboard.getString());
      }}>Round-trip clipboard</Text>
    </View>
  );
}

require('react-native').AppRegistry.registerComponent('CoreModulesProbe', () => CoreModulesProbe);

export default CoreModulesProbe;
