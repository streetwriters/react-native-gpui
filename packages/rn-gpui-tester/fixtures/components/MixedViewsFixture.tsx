import React, { createContext, useContext, useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  FixtureCard,
  FixtureSurfaceHost,
} from '@react-native-gpui/host-components-fixture';

const Theme = createContext('none');

function Themed({ testID }: { testID: string }) {
  return <Text testID={testID}>{`ctx:${useContext(Theme)}`}</Text>;
}

export default function MixedViewsFixture() {
  const [presses, setPresses] = useState(0);
  const [hover, setHover] = useState('out');
  const [typed, setTyped] = useState('');
  const [keys, setKeys] = useState('');
  const [modal, setModal] = useState(false);
  const [offset, setOffset] = useState(0);
  const [rowPressed, setRowPressed] = useState('none');
  const [start, setStart] = useState(0);
  const [recycled, setRecycled] = useState(false);
  const [chrome, setChrome] = useState('');
  return (
    <Theme.Provider value="blue">
      <View
        style={{
          padding: 8,
          gap: 8,
          flex: 1,
          flexWrap: 'wrap',
          alignContent: 'flex-start',
        }}
      >
        <FixtureCard
          testID="mixed-card"
          onChromeEvent={event => {
            const kind = event.nativeEvent.kind;
            setChrome(value => `${value}${kind},`);
          }}
          title="Mixed"
          chromeHeight={28}
          chromeWidth={12}
          style={{ width: 260, height: 220 }}
        >
          <Pressable
            testID="mixed-press"
            onPress={() => setPresses(value => value + 1)}
            onHoverIn={() => setHover('in')}
            onHoverOut={() => setHover('out')}
            style={{ height: 24, backgroundColor: '#334155' }}
          >
            <Text style={{ color: '#f8fafc' }}>press</Text>
          </Pressable>
          <TextInput
            testID="mixed-input"
            onChangeText={setTyped}
            style={{ height: 24, backgroundColor: '#e2e8f0' }}
          />
          <View
            testID="mixed-key"
            focusable
            onKeyDown={event => {
              const key = event.nativeEvent.key;
              setKeys(value => value + key);
            }}
            style={{ height: 20, backgroundColor: '#475569' }}
          />
          <Themed testID="mixed-ctx" />
          <Pressable testID="mixed-modal-open" onPress={() => setModal(true)}>
            <Text style={{ color: '#f8fafc' }}>open</Text>
          </Pressable>
          <Modal
            transparent
            visible={modal}
            onRequestClose={() => setModal(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View style={{ backgroundColor: '#fff', padding: 16 }}>
                <Themed testID="modal-ctx" />
                <Pressable testID="modal-close" onPress={() => setModal(false)}>
                  <Text>close</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </FixtureCard>
        <Text testID="mixed-chrome">{`chrome:${chrome}`}</Text>
        <Text testID="mixed-presses">{`presses:${presses}`}</Text>
        <Text testID="mixed-hover">{`hover:${hover}`}</Text>
        <Text testID="mixed-typed">{`typed:${typed}`}</Text>
        <Text testID="mixed-keys">{`keys:${keys}`}</Text>

        <FixtureSurfaceHost
          testID="mixed-surface"
          module="SurfaceProbeFixture"
          greeting="hello"
          style={{ width: 240, height: 160 }}
        />

        <FixtureCard
          testID="mixed-window"
          title="Window"
          chromeHeight={28}
          chromeWidth={0}
          style={{ width: 240, height: 120 }}
        >
          <View testID="mixed-clip" style={{ height: 80, overflow: 'hidden' }}>
            <View
              testID="mixed-content"
              style={{ transform: [{ translateY: -offset }] }}
            >
              {Array.from({ length: 10 }, (_, index) => (
                <Pressable
                  key={index}
                  testID={`row-${index}`}
                  onPress={() => setRowPressed(`row-${index}`)}
                  style={{
                    height: 20,
                    backgroundColor: index % 2 ? '#334155' : '#475569',
                  }}
                >
                  <Text style={{ color: '#f8fafc' }}>{`row ${index}`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </FixtureCard>
        <FixtureCard
          testID="mixed-recycle"
          title="Recycle"
          chromeHeight={28}
          chromeWidth={0}
          style={{ width: 240, height: 240 }}
        >
          {Array.from({ length: 30 }, (_, slot) => {
            const index = start + slot;
            return (
              <View
                key={recycled ? slot : index}
                testID={`recycle-${slot}`}
                style={{ height: 6, flexDirection: 'row', gap: 2 }}
              >
                <View
                  style={{ width: 20, height: 6, backgroundColor: '#64748b' }}
                />
                <Text style={{ fontSize: 5 }}>{`item ${index}`}</Text>
              </View>
            );
          })}
        </FixtureCard>
        <Pressable
          testID="recycle-step"
          onPress={() => setStart(value => value + 5)}
        >
          <Text>step</Text>
        </Pressable>
        <Pressable
          testID="recycle-mode"
          onPress={() => setRecycled(value => !value)}
        >
          <Text>mode</Text>
        </Pressable>
        <Text testID="recycle-first">{`first:${start}`}</Text>
        <Pressable testID="mixed-scroll" onPress={() => setOffset(100)}>
          <Text>scroll</Text>
        </Pressable>
        <Text testID="mixed-row-pressed">{`pressed:${rowPressed}`}</Text>
      </View>
    </Theme.Provider>
  );
}
