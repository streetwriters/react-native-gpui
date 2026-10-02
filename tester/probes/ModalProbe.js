import React, {useState} from 'react';
import {AppRegistry, Modal, Pressable, Text, View} from 'react-native';

function ModalProbe() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('closed');
  const [showCount, setShowCount] = useState(0);
  const [dismissCount, setDismissCount] = useState(0);
  return (
    <View style={{flex: 1, padding: 32, gap: 16, backgroundColor: '#f5f5f5'}}>
      <Text style={{fontSize: 20, color: '#111'}}>
        Modal probe: {status} (shows {showCount}, dismisses {dismissCount})
      </Text>
      <Pressable onPress={() => setVisible(true)} style={{padding: 12, backgroundColor: '#3b82f6'}}>
        <Text style={{color: '#fff'}}>Open modal</Text>
      </Pressable>
      <Modal
        testID="gpui-modal"
        visible={visible}
        transparent
        onShow={() => {
          console.log('[modal-probe] onShow');
          setStatus('open');
          setShowCount(count => count + 1);
        }}
        onDismiss={() => {
          console.log('[modal-probe] onDismiss');
          setStatus('dismissed');
          setDismissCount(count => count + 1);
        }}
        onRequestClose={() => {
          console.log('[modal-probe] onRequestClose');
          setVisible(false);
        }}>
        <View style={{flex: 1, padding: 48, backgroundColor: 'rgba(0,0,0,0.35)'}}>
          <View style={{padding: 24, gap: 16, backgroundColor: '#fff', borderRadius: 12}}>
            <Text style={{fontSize: 18, color: '#111'}}>GPUI modal content</Text>
            <Pressable onPress={() => setVisible(false)} style={{padding: 10, backgroundColor: '#10b981'}}>
              <Text style={{color: '#fff'}}>Close modal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

AppRegistry.registerComponent('ModalProbe', () => ModalProbe);

export default ModalProbe;
