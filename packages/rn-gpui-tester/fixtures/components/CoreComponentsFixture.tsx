import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function CoreComponentsFixture() {
  const [controlled, setControlled] = useState(false);
  const [changes, setChanges] = useState(0);
  const [animating, setAnimating] = useState(true);
  const [selection, setSelection] = useState('none');
  const [keys, setKeys] = useState('');
  const [events, setEvents] = useState('');
  return (
    <ScrollView
      testID="core-components-fixture"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Core components</Text>
      <View style={styles.section}>
        <Text style={styles.heading}>Switch</Text>
        <Switch
          testID="switch-controlled"
          value={controlled}
          onValueChange={value => {
            setChanges(count => count + 1);
            setControlled(value);
          }}
        />
        <Text testID="switch-value">{String(controlled)}</Text>
        <Text testID="switch-changes">{String(changes)}</Text>
        <Switch
          testID="switch-refusing"
          value={false}
          onValueChange={() => setChanges(count => count + 100)}
        />
        <Switch testID="switch-disabled" value disabled />
        <Switch
          testID="switch-colored"
          value
          trackColor={{ true: '#e91e63', false: '#000000' }}
          thumbColor="#ffeb3b"
        />
        <Switch
          testID="switch-colored-off"
          value={false}
          trackColor={{ false: '#ff9800', true: '#000000' }}
        />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>ActivityIndicator</Text>
        <ActivityIndicator testID="indicator-small" animating={animating} />
        <ActivityIndicator
          testID="indicator-large"
          size="large"
          color="#e91e63"
          animating={animating}
        />
        <ActivityIndicator
          testID="indicator-visible"
          animating={false}
          hidesWhenStopped={false}
        />
        <Text testID="indicator-toggle" onPress={() => setAnimating(a => !a)}>
          {animating ? 'stop' : 'start'}
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>TextInput</Text>
        <TextInput
          testID="input-placeholder"
          placeholder="WWWWWWWWWW"
          placeholderTextColor="#ff0000"
          style={styles.input}
        />
        <TextInput
          testID="input-select-on-focus"
          defaultValue="select me"
          selectTextOnFocus
          onSelectionChange={event =>
            setSelection(
              `${event.nativeEvent.selection.start}-${event.nativeEvent.selection.end}`,
            )
          }
          style={styles.input}
        />
        <Text testID="input-selection">{selection}</Text>
        <TextInput
          testID="input-keys"
          onKeyPress={event => {
            const key = event.nativeEvent.key;
            setKeys(previous => previous + `[${key}]`);
          }}
          onSubmitEditing={() => setEvents(previous => previous + 'submit,')}
          onEndEditing={() => setEvents(previous => previous + 'end,')}
          style={styles.input}
        />
        <Text testID="input-key-log">{keys}</Text>
        <Text testID="input-event-log">{events}</Text>
        <TextInput
          testID="input-submit-keeps-focus"
          submitBehavior="submit"
          onSubmitEditing={() => setEvents(previous => previous + 'keep,')}
          onEndEditing={() => setEvents(previous => previous + 'keep-end,')}
          style={styles.input}
        />
        <TextInput
          testID="input-caret-hidden"
          defaultValue="no caret"
          caretHidden
          style={styles.input}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  title: { fontSize: 20, color: '#111', width: '100%' },
  section: { gap: 10, width: 300 },
  heading: { fontSize: 16, color: '#333' },
  input: {
    height: 32,
    borderWidth: 1,
    borderColor: '#999',
    paddingHorizontal: 6,
    fontSize: 16,
  },
});
