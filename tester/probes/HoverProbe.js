// TODO 2.5 verification probe — hover (`topPointerEnter`/`Leave`), the `cursor`
// style prop and the four `pointerEvents` modes.
//
// Started through the Metro dev server as its own entry, so §18.16's `App` stays
// untouched:
//
//   RN_GPUI_MODULE=HoverProbe RN_GPUI_SOURCE_URL=tester/probes/HoverProbe \
//     RN_GPUI_HOVER="150,112;240,202;100,292;60,382;150,472" RN_GPUI_RUN_MS=12000 \
//     RN_GPUI_SCREENSHOT=/tmp/hover-probe.png \
//     ./packages/react-native-gpui/ReactGpui/target/debug/rn-gpui
//
// Every box logs its enter/leave with the Fabric tag RN resolved the event to
// (its own tag for `onPointerEnter`, the box's tag for the `box-only` child), so
// the log shows which node `pointerEvents` made the target. The first box also
// repaints on hover, which is the §19 "Done when" screenshot.

import React, {useState} from 'react';
import {AppRegistry, StyleSheet, Text, View} from 'react-native';

function describe(name, event) {
  const e = event.nativeEvent;
  return `[hover-probe] ${name} target=${e.target} pointerType=${
    e.pointerType
  } offset=(${Math.round(e.offsetX)},${Math.round(e.offsetY)}) buttons=${
    e.buttons
  }`;
}

const logLayout = name => event => {
  const e = event.nativeEvent;
  console.log(
    `[hover-probe] layout ${name} target=${e.target} at (${Math.round(
      e.layout.x,
    )},${Math.round(e.layout.y)}) ${Math.round(e.layout.width)}x${Math.round(
      e.layout.height,
    )}`,
  );
};

const handlers = name => ({
  onPointerEnter: event => console.log(describe(`enter ${name}`, event)),
  onPointerLeave: event => console.log(describe(`leave ${name}`, event)),
});

function HoverProbe() {
  const [hovered, setHovered] = useState(false);

  return (
    <View style={styles.app} {...handlers('root')}>
      <Text style={styles.title}>Hover probe</Text>

      {/* Done when: an RNTester-style hover example changes color on hover. */}
      <View
        onLayout={logLayout('hover-box')}
        onPointerEnter={event => {
          console.log(describe('enter hover-box', event));
          setHovered(true);
        }}
        onPointerLeave={event => {
          console.log(describe('leave hover-box', event));
          setHovered(false);
        }}
        style={[
          styles.box,
          {top: 80, backgroundColor: hovered ? '#f59e0b' : '#3b82f6'},
        ]}>
        <Text style={styles.boxLabel}>
          {hovered ? 'hovered' : 'hover me'}
        </Text>
      </View>

      {/* box-none: the box itself is not a target, its child is. */}
      <View style={[styles.box, styles.grey, {top: 170}]} pointerEvents="box-none" {...handlers('box-none')}>
        <View
          onLayout={logLayout('box-none-inner')}
          style={[styles.inner, {left: 16, top: 16}]}
          {...handlers('box-none-inner')}>
          <Text style={styles.innerLabel}>inner</Text>
        </View>
      </View>

      {/* none: neither the box nor its child are targets. */}
      <View style={[styles.box, styles.grey, {top: 260}]} pointerEvents="none" {...handlers('none')}>
        <View
          onLayout={logLayout('none-inner')}
          style={[styles.inner, {left: 16, top: 16}]}
          {...handlers('none-inner')}>
          <Text style={styles.innerLabel}>inner</Text>
        </View>
      </View>

      {/* box-only: the child is not a target, the box is. */}
      <View style={[styles.box, styles.grey, {top: 350}]} pointerEvents="box-only" {...handlers('box-only')}>
        <Text
          onLayout={logLayout('box-only-inner')}
          style={[styles.innerLabel, {position: 'absolute', left: 16, top: 22}]}
          {...handlers('box-only-inner')}>
          inner (not a target)
        </Text>
      </View>

      {/* The cursor prop: `style.rs` logs the ordinal GPUI maps. */}
      <View
        onLayout={logLayout('cursor-box')}
        style={[styles.box, styles.grey, {top: 440, cursor: 'pointer'}]}
        {...handlers('cursor-box')}>
        <Text style={styles.innerLabel}>cursor: pointer</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {flex: 1, backgroundColor: '#f5f5f5'},
  title: {position: 'absolute', left: 24, top: 24, fontSize: 20, color: '#111'},
  box: {
    position: 'absolute',
    left: 24,
    width: 240,
    height: 64,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grey: {backgroundColor: '#e5e7eb'},
  boxLabel: {color: 'white'},
  innerLabel: {color: '#111'},
  inner: {
    position: 'absolute',
    width: 120,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#c7d2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

AppRegistry.registerComponent('HoverProbe', () => HoverProbe);
