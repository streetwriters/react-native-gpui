import '@react-native-gpui/crypto';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { compile, print } from '@react-native-gpui/typst';

export default function TypstPrintPanelFixture() {
  const [status, setStatus] = useState('idle');
  return (
    <View testID="typst-print-panel" style={{ flex: 1, padding: 24, gap: 12 }}>
      <Pressable
        testID="open-print-panel"
        style={{ padding: 12, backgroundColor: '#1e293b', borderRadius: 6 }}
        onPress={() => {
          setStatus('opening');
          compile('= Print panel\nA page to print.', {
            output: { path: '/tmp/rn-gpui-typst-panel.pdf' },
          })
            .then(() =>
              print('/tmp/rn-gpui-typst-panel.pdf', { title: 'Print panel' }),
            )
            .then(result => setStatus(result.status))
            .catch(error => setStatus(`error ${String(error?.code ?? error)}`));
        }}
      >
        <Text style={{ color: '#fff' }}>Open the print panel</Text>
      </Pressable>
      <Text testID="print-panel-status">{status}</Text>
    </View>
  );
}
