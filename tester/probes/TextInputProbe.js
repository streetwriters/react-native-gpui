import React, {useEffect, useRef, useState} from 'react';
import {AppRegistry, Button, Text, TextInput, View} from 'react-native';

/** Manual GPUI TextInput probe: controlled value, selection, and multiline. */
export default function TextInputProbe() {
  const [single, setSingle] = useState('');
  const [multi, setMulti] = useState('');
  const [selection, setSelection] = useState({start: 0, end: 0});
  const singleRef = useRef(null);

  useEffect(() => {
    console.log(`[textinput-probe] single-line JS value=${JSON.stringify(single)}`);
  }, [single]);

  return (
    <View style={{flex: 1, padding: 24, gap: 16, backgroundColor: '#fff'}}>
      <Text style={{fontSize: 20}}>TextInput / IME probe</Text>
      <TextInput
        ref={singleRef}
        testID="single-line-input"
        accessible
        accessibilityLabel="Single-line text input"
        value={single}
        onChangeText={setSingle}
        onSelectionChange={event => setSelection(event.nativeEvent.selection)}
        placeholder="Type here; try accented text or an IME"
        style={{height: 42, borderWidth: 1, borderColor: '#888', padding: 8}}
      />
      <View style={{flexDirection: 'row', gap: 12}}>
        <Button title="Focus input" onPress={() => singleRef.current?.focus()} />
        <Button title="Blur input" onPress={() => singleRef.current?.blur()} />
        <Button title="Clear input" onPress={() => singleRef.current?.clear()} />
      </View>
      <Text>Value: {single}</Text>
      <Text>Selection: {selection.start}–{selection.end}</Text>
      <TextInput
        testID="multiline-input"
        accessible
        accessibilityLabel="Multiline text input"
        multiline
        value={multi}
        onChangeText={setMulti}
        placeholder="Multiline text"
        style={{height: 120, borderWidth: 1, borderColor: '#888', padding: 8}}
      />
      <Text>Multiline value: {multi}</Text>
    </View>
  );
}

AppRegistry.registerComponent('TextInputProbe', () => TextInputProbe);
