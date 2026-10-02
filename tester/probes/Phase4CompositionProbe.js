import React, {useEffect, useState} from 'react';
import {AppRegistry, Button, Modal, Text, View} from 'react-native';

/** Verify an RN Modal/GPUI overlay paints above the native AppKit test surface. */
export default function Phase4CompositionProbe() {
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    console.log('[phase4-composition] native fixture enabled; overlay visible');
  }, []);

  return (
    <View style={{flex: 1, padding: 24, gap: 12, backgroundColor: '#f3f4f6'}}>
      <Text style={{fontSize: 22}}>Phase 4.1: native layer composition</Text>
      <Text>
        A blue AppKit NSView sits behind this RN surface. Show the translucent
        RN Modal to check that GPUI can paint above and cover that native view.
      </Text>
      <Button title="Show RN overlay" onPress={() => setOverlayVisible(true)} />
      <Text>
        The native fixture is positioned near the upper-left of the window.
        Resize the window to check whether its composition surface follows the
        element bounds.
      </Text>
      <Modal transparent visible={overlayVisible} animationType="none">
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
          <View
            style={{
              width: 410,
              minHeight: 190,
              padding: 24,
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255,255,255,0.78)',
              borderColor: '#18212f',
              borderWidth: 2,
              borderRadius: 12,
            }}>
            <Text style={{fontSize: 20, color: '#18212f'}}>
              RN overlay above the blue NSView
            </Text>
            <Text style={{color: '#18212f'}}>
              The translucent card should show the native blue behind it.
            </Text>
            <Button
              title="Hide RN overlay"
              onPress={() => setOverlayVisible(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

AppRegistry.registerComponent('Phase4CompositionProbe', () => Phase4CompositionProbe);
