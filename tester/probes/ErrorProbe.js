// TODO 2.6 verification probe — a JS error thrown while rendering must surface as
// LogBox's red box, not just as a line in the host log.
//
//   RN_GPUI_MODULE=ErrorProbe RN_GPUI_SOURCE_URL=tester/probes/ErrorProbe \
//     RN_GPUI_RUN_MS=8000 RN_GPUI_SCREENSHOT=/tmp/error-probe.png \
//     ./packages/react-native-gpui/ReactGpui/target/debug/rn-gpui

import React from 'react';
import {AppRegistry, StyleSheet, Text, View} from 'react-native';

function Broken(): React.Node {
  throw new Error('ErrorProbe: boom while rendering');
}

function ErrorProbe(): React.Node {
  return (
    <View style={styles.app}>
      <Text style={styles.title}>Error probe</Text>
      <Broken />
    </View>
  );
}

const styles = StyleSheet.create({
  app: {flex: 1, backgroundColor: '#f5f5f5'},
  title: {position: 'absolute', left: 24, top: 24, fontSize: 20, color: '#111'},
});

AppRegistry.registerComponent('ErrorProbe', () => ErrorProbe);
