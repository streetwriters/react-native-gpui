import React from 'react';
import { View } from 'react-native';
import { NativeRoot } from '@react-native-gpui/core/desktop';
import { FixturePopup } from '@react-native-gpui/host-components-fixture';

type Native = React.ComponentType<Record<string, unknown>>;
const Popup = FixturePopup as unknown as Native;

/** A popup from a host component, as a Fabric node and in a native tree. */
export default function PopupFixture() {
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 20, padding: 10 }}>
      <Popup
        testID="popup-fabric"
        top={150}
        style={{ width: 100, height: 100 }}
      />
      <NativeRoot testID="popup-native" style={{ width: 100, height: 100 }}>
        <Popup top={400} />
      </NativeRoot>
    </View>
  );
}
