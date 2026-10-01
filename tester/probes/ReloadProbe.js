// TODO 2.6 verification probe — reload.
//
// Renders a label that comes from `tester/reloadLabel.js` and calls
// `DevSettings.reload()` once, a few seconds in. The verification edits that
// fixture while the app is running: the screenshot taken after the reload must
// show the NEW label, which proves the reload re-fetched the bundle from Metro
// and that the view tree was rebuilt from scratch (no stale nodes).
//
//   RN_GPUI_MODULE=ReloadProbe RN_GPUI_SOURCE_URL=tester/probes/ReloadProbe \
//     RN_GPUI_RUN_MS=17000 RN_GPUI_SCREENSHOT_DELAY_MS=13000 \
//     RN_GPUI_SCREENSHOT=/tmp/reload-probe.png \
//     ./packages/react-native-gpui/ReactGpui/target/debug/rn-gpui

import React, {useEffect} from 'react';
import {AppRegistry, DevSettings, StyleSheet, Text, View} from 'react-native';

import label from '../reloadLabel';

function ReloadProbe(): React.Node {
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[reload-probe] calling DevSettings.reload()');
      DevSettings.reload('reload-probe');
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.app}>
      <Text style={styles.title}>reload probe</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {flex: 1, backgroundColor: '#f5f5f5'},
  title: {position: 'absolute', left: 24, top: 24, fontSize: 20, color: '#111'},
  label: {position: 'absolute', left: 24, top: 64, fontSize: 18, color: '#b91c1c'},
});

AppRegistry.registerComponent('ReloadProbe', () => ReloadProbe);
