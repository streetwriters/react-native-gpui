import React, { useState } from 'react';
import { AppRegistry, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SvgUri, SvgXml } from 'react-native-svg';

const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" rx="12" fill="#152238"/><path d="M18 57 43 25l19 21 14-17 26 28" fill="none" stroke="#64d2ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="88" cy="25" r="6" fill="#ff6584"/></svg>`;

function SvgProbe() {
  const [uriStatus, setUriStatus] = useState('Loading remote SvgUri…');

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text style={styles.title}>React Native SVG</Text>
      <View style={styles.row}>
        <Svg width={180} height={120} viewBox="0 0 180 120">
          <Rect x={4} y={4} width={172} height={112} rx={18} fill="#16243c" />
          <Path
            d="M24 85 62 28l29 37 22-26 43 46"
            fill="none"
            stroke="#60d5fa"
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={132} cy={30} r={9} fill="#ff6584" />
        </Svg>
        <SvgXml xml={xml} width={180} height={120} />
      </View>
      <Text style={styles.label}>Fabric primitives and SvgXml</Text>
      <SvgUri
        width={180}
        height={120}
        color="#64d2ff"
        uri="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/circle-check.svg"
        onLoad={() => setUriStatus('Remote SvgUri loaded.')}
        onError={error =>
          setUriStatus(`Remote SvgUri failed: ${error.message}`)
        }
      />
      <Text style={styles.label}>{uriStatus}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101521' },
  content: { padding: 32, gap: 22, alignItems: 'flex-start' },
  title: { color: '#f5f7ff', fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 24 },
  label: { color: '#b9c4d8', fontSize: 15 },
});

AppRegistry.registerComponent('NavigationExample', () => SvgProbe);
