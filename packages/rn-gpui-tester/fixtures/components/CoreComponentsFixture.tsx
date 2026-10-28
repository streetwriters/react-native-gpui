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
  const [readOnlySelection, setReadOnlySelection] = useState('none');
  const [menuSelection, setMenuSelection] = useState('none');
  const [multiSizes, setMultiSizes] = useState('');
  const [multiScroll, setMultiScroll] = useState(0);
  const [limited, setLimited] = useState('');
  return (
    <ScrollView
      testID="core-components-fixture"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Core components</Text>
      <View style={styles.fontRow}>
        <Text testID="font-default" style={styles.fontSample}>
          Scale
        </Text>
        <Text
          testID="font-fixed"
          allowFontScaling={false}
          style={styles.fontSample}
        >
          Scale
        </Text>
        <Text
          testID="font-capped"
          maxFontSizeMultiplier={1.5}
          style={styles.fontSample}
        >
          Scale
        </Text>
      </View>
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
        <TextInput
          testID="input-multi"
          multiline
          numberOfLines={3}
          defaultValue={'1\n2\n3\n4\n5\n6\n7\n8\n9\n10'}
          onContentSizeChange={event => {
            const { width, height } = event.nativeEvent.contentSize;
            setMultiSizes(
              previous =>
                previous + `${Math.round(width)}x${Math.round(height)},`,
            );
          }}
          onScroll={event =>
            setMultiScroll(Math.round(event.nativeEvent.contentOffset.y))
          }
          style={styles.multi}
        />
        <Text testID="input-multi-sizes">{multiSizes}</Text>
        <Text testID="input-multi-scroll">{String(multiScroll)}</Text>
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
          testID="input-caret-hidden"
          defaultValue="no caret"
          caretHidden
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
          testID="input-max-length"
          maxLength={5}
          onChangeText={setLimited}
          style={styles.input}
        />
        <Text testID="input-max-length-value">{`[${limited}]`}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>TextInput 2</Text>
        <TextInput
          testID="input-read-only"
          readOnly
          defaultValue="read only"
          onChangeText={() => setEvents(previous => previous + 'ro-change,')}
          onSelectionChange={event =>
            setReadOnlySelection(
              `${event.nativeEvent.selection.start}-${event.nativeEvent.selection.end}`,
            )
          }
          style={styles.input}
        />
        <Text testID="input-read-only-selection">{readOnlySelection}</Text>
        <TextInput
          testID="input-menu"
          defaultValue="hello world"
          onSelectionChange={event =>
            setMenuSelection(
              `${event.nativeEvent.selection.start}-${event.nativeEvent.selection.end}`,
            )
          }
          style={styles.input}
        />
        <Text testID="input-menu-selection">{menuSelection}</Text>
        <TextInput
          testID="input-menu-hidden"
          defaultValue="no menu"
          contextMenuHidden
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
  multi: {
    width: 260,
    padding: 0,
    fontSize: 14,
    lineHeight: 20,
    color: '#111',
    backgroundColor: '#eef',
  },
  fontRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  fontSample: { fontSize: 16, color: '#111' },
  input: {
    height: 32,
    borderWidth: 1,
    borderColor: '#999',
    paddingHorizontal: 6,
    fontSize: 16,
  },
});
