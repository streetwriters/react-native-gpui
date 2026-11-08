import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';

const STAR =
  'M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z';

const ARROW =
  '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path d="M17.5005 10C17.5005 10.1658 17.4346 10.3247 17.3174 10.4419C17.2002 10.5592 17.0413 10.625 16.8755 10.625H4.63409L9.19268 15.1828C9.25075 15.2409 9.29681 15.3098 9.32824 15.3857C9.35966 15.4616 9.37584 15.5429 9.37584 15.625C9.37584 15.7071 9.35966 15.7884 9.32824 15.8643C9.29681 15.9402 9.25075 16.0091 9.19268 16.0672C9.13461 16.1253 9.06567 16.1713 8.9898 16.2027C8.91393 16.2342 8.83261 16.2503 8.75049 16.2503C8.66837 16.2503 8.58705 16.2342 8.51118 16.2027C8.43531 16.1713 8.36637 16.1253 8.3083 16.0672L2.6833 10.4422C2.62519 10.3841 2.57909 10.3152 2.54764 10.2393C2.51619 10.1635 2.5 10.0821 2.5 10C2.5 9.91786 2.51619 9.83653 2.54764 9.76066C2.57909 9.68479 2.62519 9.61586 2.6833 9.55781L8.3083 3.93281C8.42558 3.81553 8.58464 3.74965 8.75049 3.74965C8.91634 3.74965 9.0754 3.81553 9.19268 3.93281C9.30996 4.05008 9.37584 4.20914 9.37584 4.375C9.37584 4.54085 9.30996 4.69991 9.19268 4.81718L4.63409 9.375H16.8755C17.0413 9.375 17.2002 9.44085 17.3174 9.55806C17.4346 9.67527 17.5005 9.83424 17.5005 10Z" fill="currentColor"/>\n</svg>';

const SEARCH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 15 15" fill="none">  <path d="M13.4559 12.7936L10.5221 9.86041C11.3725 8.83954 11.7965 7.53013 11.706 6.20459C11.6155 4.87905 11.0174 3.63943 10.0362 2.7436C9.05505 1.84777 7.76626 1.3647 6.43797 1.39489C5.10969 1.42508 3.84418 1.96619 2.9047 2.90567C1.96522 3.84516 1.4241 5.11067 1.39391 6.43895C1.36372 7.76723 1.84679 9.05602 2.74262 10.0372C3.63845 11.0184 4.87807 11.6165 6.20361 11.707C7.52916 11.7975 8.83856 11.3734 9.85943 10.5231L12.7926 13.4569C12.8362 13.5004 12.8879 13.535 12.9448 13.5586C13.0017 13.5821 13.0627 13.5943 13.1243 13.5943C13.1859 13.5943 13.2469 13.5821 13.3038 13.5586C13.3607 13.535 13.4124 13.5004 13.4559 13.4569C13.4995 13.4133 13.534 13.3616 13.5576 13.3047C13.5812 13.2478 13.5933 13.1868 13.5933 13.1253C13.5933 13.0637 13.5812 13.0027 13.5576 12.9458C13.534 12.8889 13.4995 12.8372 13.4559 12.7936ZM2.34303 6.56275C2.34303 5.72836 2.59045 4.91271 3.05402 4.21894C3.51758 3.52517 4.17646 2.98445 4.94733 2.66514C5.71821 2.34583 6.56646 2.26229 7.38482 2.42507C8.20317 2.58785 8.95488 2.98965 9.54488 3.57965C10.1349 4.16965 10.5367 4.92136 10.6995 5.73972C10.8622 6.55807 10.7787 7.40632 10.4594 8.1772C10.1401 8.94808 9.59936 9.60695 8.90559 10.0705C8.21182 10.5341 7.39617 10.7815 6.56178 10.7815C5.44328 10.7803 4.37094 10.3354 3.58004 9.54449C2.78914 8.75359 2.34427 7.68126 2.34303 6.56275Z" fill="currentColor"/></svg>';

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
      <View style={styles.row}>
        <View testID="svg-edge-search" style={styles.box15}>
          <SvgXml xml={SEARCH} width={15} height={15} color="#181818" />
        </View>
        <View testID="svg-edge-search-transform" style={styles.field}>
          <View style={styles.centered}>
            <SvgXml xml={SEARCH} width={15} height={15} color="#181818" />
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
  field: { width: 30, height: 40, backgroundColor: '#f7f7f7' },
  centered: {
    position: 'absolute',
    left: 10,
    top: '50%',
    width: 15,
    height: 15,
    transform: [{ translateY: -7.5 }],
  },
  box15: { width: 15, height: 15, backgroundColor: '#f7f7f7' },
  box: { width: 16, height: 16, backgroundColor: '#f7f7f7' },
});
