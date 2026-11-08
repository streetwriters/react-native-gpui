import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const STAR =
  'M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z';

/**
 * A 16 point icon on a flat background, drawn in the two ways the web app's
 * icons are: with a fixed size, and filling a box with a stretched view box.
 */
export function SvgEdgeFixture() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>SVG edges</Text>
      <View style={styles.row}>
        <View testID="svg-edge-fixed" style={styles.box}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d={STAR} fill="#181818" />
          </Svg>
        </View>
        <View testID="svg-edge-stretched" style={styles.box}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 24 24"
            preserveAspectRatio="none"
          >
            <Path d={STAR} fill="#181818" />
          </Svg>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', padding: 24, gap: 12 },
  title: { color: '#111111', fontSize: 16 },
  row: { flexDirection: 'row', gap: 24 },
  box: { width: 16, height: 16, backgroundColor: '#f7f7f7' },
});
