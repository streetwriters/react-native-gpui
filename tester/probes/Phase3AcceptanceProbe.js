import React, {useEffect, useRef, useState} from 'react';
import {Alert, Animated, AppRegistry, Appearance, Dimensions, Linking, Modal, Pressable, ScrollView, Text, TextInput, View, useColorScheme, useWindowDimensions} from 'react-native';
import NativeClipboard from 'react-native/Libraries/Components/Clipboard/NativeClipboard';

export default function Phase3AcceptanceProbe() {
  const [text, setText] = useState('');
  const [selection, setSelection] = useState({start: 0, end: 0});
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [clipboardResult, setClipboardResult] = useState('pending');
  const [linkingResult, setLinkingResult] = useState('pending');
  const [alertResult, setAlertResult] = useState('pending');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalResult, setModalResult] = useState('hidden');
  const scheme = useColorScheme();
  const opacity = useRef(new Animated.Value(0.15)).current;
  const transformTranslate = useRef(new Animated.Value(0)).current;
  const transformScale = useRef(new Animated.Value(0.8)).current;
  const background = scheme === 'dark' ? '#1c1c1e' : '#fff';
  const foreground = scheme === 'dark' ? '#f5f5f7' : '#18212f';
  const windowDimensions = useWindowDimensions();

  useEffect(() => {
    console.log(`[phase3] appearance=${scheme ?? 'unknown'}`);
  }, [scheme]);
  useEffect(() => {
    console.log(`[phase3] dimensions-event=${Math.round(dimensions.width)}x${Math.round(dimensions.height)}`);
  }, [dimensions]);
  useEffect(() => {
    console.log(`[phase3] clipboard=${clipboardResult}`);
  }, [clipboardResult]);
  useEffect(() => {
    console.log(`[phase3] linking=${linkingResult}`);
  }, [linkingResult]);
  useEffect(() => {
    console.log(`[phase3] modal=${modalResult}`);
  }, [modalResult]);
  useEffect(() => {
    console.log(`[phase3] alert=${alertResult}`);
  }, [alertResult]);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, {toValue: 1, duration: 450, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 0.15, duration: 450, useNativeDriver: true}),
    ]));
    animation.start();
    const transformAnimation = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(transformTranslate, {toValue: 28, duration: 700, useNativeDriver: false}),
        Animated.timing(transformScale, {toValue: 1.12, duration: 700, useNativeDriver: false}),
      ]),
      Animated.parallel([
        Animated.timing(transformTranslate, {toValue: 0, duration: 700, useNativeDriver: false}),
        Animated.timing(transformScale, {toValue: 0.8, duration: 700, useNativeDriver: false}),
      ]),
    ]));
    transformAnimation.start();
    const changeScheme = setTimeout(() => Appearance.setColorScheme('dark'), 300);
    const clipboardCheck = (async () => {
      try {
        if (!NativeClipboard) throw new Error('Clipboard TurboModule unavailable');
        NativeClipboard.setString('GPUI clipboard round-trip');
        const result = await NativeClipboard.getString();
        setClipboardResult(result === 'GPUI clipboard round-trip' ? 'pass' : `received ${JSON.stringify(result)}`);
      } catch (error) {
        setClipboardResult(`fail: ${String(error)}`);
      }
    })();
    const linkingCheck = Linking.canOpenURL('HTTPS://example.com')
      .then(result => setLinkingResult(result ? 'https supported' : 'https unsupported'))
      .catch(error => setLinkingResult(`fail: ${String(error)}`));
    const openModal = setTimeout(() => setModalVisible(true), 1100);
    const closeModal = setTimeout(() => setModalVisible(false), 2100);
    const showAlert = setTimeout(() => {
      console.log(
        `[phase3] Alert APIs alert=${typeof Alert?.alert} prompt=${typeof Alert?.prompt}`,
      );
      try {
        Alert.alert('GPUI alert probe', 'Choose OK to verify the callback.', [
          {text: 'OK', onPress: () => setAlertResult('callback fired')},
        ]);
      } catch (error) {
        console.log(
          `[phase3] alert-error=${error?.stack ?? String(error)}`,
        );
      }
    }, 2700);
    const dimensionListener = Dimensions.addEventListener('change', next => setDimensions(next.window));
    return () => {
      animation.stop();
      transformAnimation.stop();
      clearTimeout(changeScheme);
      clearTimeout(openModal);
      clearTimeout(closeModal);
      clearTimeout(showAlert);
      dimensionListener.remove();
      void clipboardCheck;
      void linkingCheck;
    };
  }, [opacity]);

  const titleStyle = {fontSize: 19, fontWeight: '700', color: foreground};
  const lineStyle = {color: foreground};
  const cardStyle = {padding: 12, gap: 8, backgroundColor: background, borderWidth: 1, borderColor: '#9ca3af', borderRadius: 10};
  return (
    <ScrollView style={{flex: 1, backgroundColor: background}} contentContainerStyle={{padding: 20, gap: 12}}>
      <Text style={titleStyle}>React Native GPUI Phase 3 acceptance</Text>
      <View style={cardStyle}>
        <Text style={lineStyle}>3.4 TextInput / IME</Text>
        <TextInput testID="phase3-textinput" accessible accessibilityLabel="Phase 3 text input" value={text} onChangeText={setText} onSelectionChange={event => setSelection(event.nativeEvent.selection)} placeholder="Type here; try IME composition" style={{height: 42, borderWidth: 1, borderColor: '#64748b', color: foreground, padding: 8}} />
        <Text style={lineStyle}>value={JSON.stringify(text)} selection={selection.start}–{selection.end}</Text>
        <TextInput testID="phase3-multiline" multiline value={text} onChangeText={setText} placeholder="Multiline input" style={{height: 72, borderWidth: 1, borderColor: '#64748b', color: foreground, padding: 8}} />
      </View>
      <View style={cardStyle}>
        <Text style={lineStyle}>3.5 transform / 3.6 native Animated</Text>
        <View style={{width: 220, height: 70, borderWidth: 1, borderColor: '#64748b'}}>
          <Animated.View testID="phase3-transform" style={{width: 90, height: 42, backgroundColor: '#3b82f6', transform: [{translateX: transformTranslate}, {scale: transformScale}]}} />
        </View>
        <Animated.View testID="phase3-native-opacity" accessibilityLabel="Native animated opacity" style={{width: 120, height: 36, opacity, backgroundColor: '#10b981'}} />
        <Text style={lineStyle}>Rotate spike is recorded in §19.</Text>
      </View>
      <View style={cardStyle}>
        <Text style={lineStyle}>3.7 Accessibility</Text>
        <Pressable testID="phase3-accessible-button" accessible accessibilityRole="button" accessibilityLabel="Phase 3 accessible button" accessibilityState={{selected: true, expanded: false}} style={{padding: 10, backgroundColor: '#7c3aed'}}><Text style={{color: '#fff'}}>Accessible button</Text></Pressable>
        <Pressable testID="phase3-disabled-button" disabled accessible accessibilityRole="button" accessibilityLabel="Unavailable action" accessibilityState={{disabled: true}} style={{padding: 10, backgroundColor: '#64748b'}}><Text style={{color: '#fff'}}>Unavailable</Text></Pressable>
      </View>
      <View style={cardStyle}>
        <Text style={lineStyle}>3.8 per-edge borders</Text>
        <View testID="phase3-rounded-border" style={{width: 210, height: 54, borderTopWidth: 4, borderRightWidth: 7, borderBottomWidth: 3, borderLeftWidth: 5, borderTopColor: '#ef4444', borderRightColor: '#22c55e', borderBottomColor: '#3b82f6', borderLeftColor: '#a855f7', borderRadius: 16}} />
      </View>
      <View style={cardStyle}>
        <Text style={lineStyle}>3.9 Modal: {modalResult}</Text>
        <Modal transparent visible={modalVisible} onShow={() => setModalResult('shown')} onDismiss={() => setModalResult('dismissed')} onRequestClose={() => setModalVisible(false)}>
          <View style={{flex: 1, padding: 48, backgroundColor: 'rgba(0,0,0,0.35)'}}><View style={{padding: 18, backgroundColor: '#fff', borderRadius: 12}}><Text>Modal overlay</Text></View></View>
        </Modal>
      </View>
      <View style={cardStyle}>
        <Text style={lineStyle}>3.10 Appearance: {scheme}; viewport: {Math.round(windowDimensions.width)} × {Math.round(windowDimensions.height)}</Text>
        <Text style={lineStyle}>Dimensions event: {Math.round(dimensions.width)} × {Math.round(dimensions.height)}</Text>
        <Text style={lineStyle}>Clipboard: {clipboardResult}; Linking: {linkingResult}; Alert: {alertResult}</Text>
        <Pressable onPress={() => Alert.alert('Manual alert', 'Verify callback.', [{text: 'OK', onPress: () => setAlertResult('manual callback')}])} style={{padding: 10, backgroundColor: '#0ea5e9'}}><Text style={{color: '#fff'}}>Show manual alert</Text></Pressable>
      </View>
    </ScrollView>
  );
}

AppRegistry.registerComponent('Phase3AcceptanceProbe', () => Phase3AcceptanceProbe);
