import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';

const STAR =
  'M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z';

const ARROW =
  '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path d="M17.5005 10C17.5005 10.1658 17.4346 10.3247 17.3174 10.4419C17.2002 10.5592 17.0413 10.625 16.8755 10.625H4.63409L9.19268 15.1828C9.25075 15.2409 9.29681 15.3098 9.32824 15.3857C9.35966 15.4616 9.37584 15.5429 9.37584 15.625C9.37584 15.7071 9.35966 15.7884 9.32824 15.8643C9.29681 15.9402 9.25075 16.0091 9.19268 16.0672C9.13461 16.1253 9.06567 16.1713 8.9898 16.2027C8.91393 16.2342 8.83261 16.2503 8.75049 16.2503C8.66837 16.2503 8.58705 16.2342 8.51118 16.2027C8.43531 16.1713 8.36637 16.1253 8.3083 16.0672L2.6833 10.4422C2.62519 10.3841 2.57909 10.3152 2.54764 10.2393C2.51619 10.1635 2.5 10.0821 2.5 10C2.5 9.91786 2.51619 9.83653 2.54764 9.76066C2.57909 9.68479 2.62519 9.61586 2.6833 9.55781L8.3083 3.93281C8.42558 3.81553 8.58464 3.74965 8.75049 3.74965C8.91634 3.74965 9.0754 3.81553 9.19268 3.93281C9.30996 4.05008 9.37584 4.20914 9.37584 4.375C9.37584 4.54085 9.30996 4.69991 9.19268 4.81718L4.63409 9.375H16.8755C17.0413 9.375 17.2002 9.44085 17.3174 9.55806C17.4346 9.67527 17.5005 9.83424 17.5005 10Z" fill="currentColor"/>\n</svg>';

/**
 * A 16 point icon on a flat background, drawn in the two ways the web app's
 * icons are: with a fixed size, and filling a box with a stretched view box. The
 * arrow is a 15 point icon centred in a 20 point button, which puts it at a half
 * point, as an app's toolbar buttons do.
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
      <View style={styles.row}>
        <View testID="svg-edge-centered" style={styles.button}>
          <View style={styles.icon}>
            <SvgXml
              xml={ARROW}
              width={15}
              height={15}
              color="rgb(188,188,188)"
            />
          </View>
        </View>
        <View testID="svg-edge-centered-stretched" style={styles.button}>
          <View style={styles.icon}>
            <SvgXml
              xml={ARROW.replace(
                'width="20" height="20"',
                'preserveAspectRatio="none" overflow="visible" width="100%" height="100%"',
              )}
              width={15}
              height={15}
              color="rgb(188,188,188)"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', padding: 24, gap: 12 },
  title: { color: '#111111', fontSize: 16 },
  row: { flexDirection: 'row', gap: 24 },
  button: {
    width: 20,
    height: 20,
    backgroundColor: '#f7f7f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 15, height: 15 },
  box: { width: 16, height: 16, backgroundColor: '#f7f7f7' },
});
