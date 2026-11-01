/**
 * A window drawn under a transparent title bar has content behind the bar, so
 * the view pads its top by the bar's height. Every other window has no inset.
 */
import * as React from 'react';
import View from '../View/View';
import StyleSheet from '../../StyleSheet/StyleSheet';
import { useWindowState } from '@react-native-gpui/core/desktop';

const SafeAreaView = React.forwardRef(function SafeAreaView(props, ref) {
  const inset = useWindowState()?.topInset ?? 0;
  if (inset === 0) {
    return <View {...props} ref={ref} />;
  }
  const flat = StyleSheet.flatten(props.style) ?? {};
  const own = flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0;
  return (
    <View
      {...props}
      ref={ref}
      style={[
        props.style,
        { paddingTop: (typeof own === 'number' ? own : 0) + inset },
      ]}
    />
  );
});

SafeAreaView.displayName = 'SafeAreaView';
export default SafeAreaView;
