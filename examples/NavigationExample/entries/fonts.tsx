import React, { useEffect, useState } from 'react';
import {
  AppRegistry,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import { loadAsync } from '@react-native-gpui/fonts';
import { createIconSet } from '@react-native-vector-icons/common';

const MaterialIcon = createIconSet(
  { favorite: 0xe87d, home: 0xe88a, search: 0xe8b6, star: 0xe838 },
  'Material Icons',
  'MaterialIcons-Regular.ttf',
);

export function FontProbe({
  fontSource = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf',
}: {
  fontSource?: string | number;
}) {
  const [status, setStatus] = useState(
    'Loading Inter through the native font loader…',
  );
  const [asyncIcon, setAsyncIcon] = useState<{
    uri: string;
    scale: number;
  } | null>(null);

  useEffect(() => {
    loadAsync({
      Inter: fontSource,
    })
      .then(() => setStatus('Inter loaded. Check weights 400, 600, and 800.'))
      .catch(error => {
        console.error('[gpui-fonts] load failed', error);
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        setStatus(`Font load failed: ${message}`);
      });
    MaterialIcon.getImageSource('favorite', 40, '#ff6584')
      .then(source => setAsyncIcon(source ?? null))
      .catch(error => console.error('[gpui-fonts] icon raster failed', error));
  }, [fontSource]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Custom fonts on GPUI</Text>
      <Text testID="font-load-status" style={styles.status}>
        {status}
      </Text>
      <View style={styles.card}>
        <Text style={styles.section}>System font</Text>
        {[400, 600, 800].map(weight => (
          <Text
            testID={`system-font-${weight}`}
            key={`system-${weight}`}
            style={[
              styles.system,
              { fontWeight: String(weight) as TextStyle['fontWeight'] },
            ]}
          >
            System {weight}: Sphinx of black quartz, judge my vow.
          </Text>
        ))}
        <Text style={styles.section}>Inter</Text>
        {[400, 600, 800].map(weight => (
          <Text
            testID={`inter-font-${weight}`}
            key={weight}
            style={[
              styles.sample,
              { fontWeight: String(weight) as TextStyle['fontWeight'] },
            ]}
          >
            Inter {weight}: Sphinx of black quartz, judge my vow.
          </Text>
        ))}
        <Text style={styles.italic}>
          Italic fallback and punctuation: café — 012345.
        </Text>
      </View>
      <View style={styles.iconCard}>
        <Text style={styles.section}>react-native-vector-icons</Text>
        <View style={styles.iconRow}>
          <MaterialIcon name="home" size={36} color="#60d5fa" />
          <MaterialIcon name="search" size={36} color="#a78bfa" />
          <MaterialIcon name="star" size={36} color="#fbbf24" />
          <Image
            source={MaterialIcon.getImageSourceSync('home', 40, '#60d5fa')}
            style={styles.iconImage}
          />
          {asyncIcon ? (
            <Image source={asyncIcon} style={styles.iconImage} />
          ) : null}
        </View>
        <Text style={styles.caption}>
          Text glyphs, sync PNG source, and async PNG source.
        </Text>
      </View>
      <Text style={styles.caption}>
        Fonts in desktop/assets/fonts are installed at app startup; loadAsync
        also accepts a packaged asset or a remote URI.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101521' },
  content: { padding: 36, gap: 20 },
  title: { color: '#f5f7ff', fontSize: 30, fontWeight: '700' },
  status: { color: '#64d2ff', fontSize: 14 },
  card: { padding: 24, gap: 18, backgroundColor: '#1a2538', borderRadius: 16 },
  iconCard: {
    padding: 24,
    gap: 18,
    backgroundColor: '#1a2538',
    borderRadius: 16,
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  iconImage: { width: 40, height: 40 },
  section: { color: '#64d2ff', fontSize: 14, fontWeight: '700' },
  system: { color: '#f2f4f8', fontSize: 23 },
  sample: { color: '#f2f4f8', fontFamily: 'Inter', fontSize: 23 },
  italic: {
    color: '#bbc6d8',
    fontFamily: 'Inter',
    fontSize: 17,
    fontStyle: 'italic',
  },
  caption: { maxWidth: 700, color: '#9daac0', fontSize: 15, lineHeight: 23 },
});

AppRegistry.registerComponent('NavigationExample', () => FontProbe);
