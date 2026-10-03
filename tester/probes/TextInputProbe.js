import React, { useEffect, useRef, useState } from 'react';
import { AppRegistry, Button, Text, TextInput, View } from 'react-native';

/** Manual GPUI TextInput probe: controlled value, selection, and multiline. */
export default function TextInputProbe() {
  const [single, setSingle] = useState('');
  const [multi, setMulti] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const singleRef = useRef(null);

  useEffect(() => {
    console.log(
      `[textinput-probe] single-line JS value=${JSON.stringify(single)}`,
    );
  }, [single]);
  useEffect(() => {
    console.log(
      `[textinput-probe] selection=${selection.start}-${selection.end}`,
    );
  }, [selection]);
  useEffect(() => {
    console.log(
      `[textinput-probe] multiline JS value=${JSON.stringify(multi)}`,
    );
  }, [multi]);

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: '#15171b' }}>
      <Text style={{ fontSize: 20, color: '#f1f3f4' }}>
        TextInput / IME probe (dark)
      </Text>
      <TextInput
        ref={singleRef}
        testID="single-line-input"
        accessible
        accessibilityLabel="Single-line text input"
        value={single}
        onChangeText={setSingle}
        onSelectionChange={event => setSelection(event.nativeEvent.selection)}
        placeholder="Type here; try accented text or an IME"
        selectionColor="#8ab4f8"
        style={{
          height: 42,
          borderWidth: 1,
          borderColor: '#8a8d93',
          padding: 8,
          color: '#f1f3f4',
          backgroundColor: '#25282e',
        }}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button
          title="Focus input"
          onPress={() => singleRef.current?.focus()}
        />
        <Button title="Blur input" onPress={() => singleRef.current?.blur()} />
        <Button
          title="Clear input"
          onPress={() => singleRef.current?.clear()}
        />
      </View>
      <Text style={{ color: '#f1f3f4' }}>Value: {single}</Text>
      <Text style={{ color: '#f1f3f4' }}>
        Selection: {selection.start}–{selection.end}
      </Text>
      <TextInput
        testID="multiline-input"
        accessible
        accessibilityLabel="Multiline text input"
        multiline
        value={multi}
        onChangeText={setMulti}
        placeholder="Multiline text"
        selectionColor="#8ab4f8"
        style={{
          height: 120,
          borderWidth: 1,
          borderColor: '#8a8d93',
          padding: 8,
          color: '#f1f3f4',
          backgroundColor: '#25282e',
        }}
      />
      <Text style={{ color: '#f1f3f4' }}>Multiline value: {multi}</Text>
    </View>
  );
}

AppRegistry.registerComponent('TextInputProbe', () => TextInputProbe);
