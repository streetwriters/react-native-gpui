import React, { createContext, useContext, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeRoot, NativeSlot } from '@react-native-gpui/core/desktop';

type NativeElement = React.ComponentType<Record<string, unknown>>;
const Box = 'FixtureNativeBox' as unknown as NativeElement;
const Popover = 'FixtureNativePopover' as unknown as NativeElement;

const Where = createContext('none');

function Reads({ testID }: { testID: string }) {
  return <Text testID={testID}>{`context:${useContext(Where)}`}</Text>;
}

/**
 * React Native content in the slots of a native tree: it takes the width the
 * tree's layout gives it, pushes the native components after it down by its
 * height, receives presses and sees contexts from both sides.
 */
export default function NativeSlotFixture() {
  const [log, setLog] = useState('');
  const [lines, setLines] = useState(1);
  const [shown, setShown] = useState(true);
  const [typed, setTyped] = useState('');
  const [popover, setPopover] = useState(false);
  const [modal, setModal] = useState(false);
  const note = (name: string) => setLog(value => `${value}${name},`);
  const red = (name: string, height = 20) => (
    <Box
      testID={`slot-${name}`}
      color={0xff0000}
      height={height}
      onPress={() => note(name)}
    />
  );
  return (
    <Where.Provider value="outer">
      <View style={{ padding: 8, gap: 8 }}>
        <Text testID="slot-log">{`log:${log}`}</Text>
        <View style={{ width: 240, height: 400 }}>
          <NativeRoot testID="slot-root" style={{ width: 240, height: 400 }}>
            <Box direction="column">
              {red('above')}
              <Where.Provider value="native">
                {shown ? (
                  <NativeSlot>
                    <View
                      testID="slot-content"
                      style={{ backgroundColor: '#0000ff', padding: 4 }}
                    >
                      <Text testID="slot-text">
                        {Array.from({ length: lines }, () => 'word').join(' ')}
                      </Text>
                      <Pressable
                        testID="slot-press"
                        onPress={() => note('press')}
                        style={{ height: 30, backgroundColor: '#00ff00' }}
                      />
                      <Reads testID="slot-context" />
                      <NativeRoot style={{ width: 100, height: 20 }}>
                        <Box direction="column">
                          <Box
                            testID="slot-inner"
                            color={0xffff00}
                            height={20}
                            onPress={() => note('inner')}
                          />
                        </Box>
                      </NativeRoot>
                    </View>
                  </NativeSlot>
                ) : null}
              </Where.Provider>
              {red('below')}
            </Box>
          </NativeRoot>
        </View>
        <NativeRoot
          testID="slot-panel-root"
          style={{ width: 240, height: 100 }}
        >
          <Box direction="column" height={100}>
            {red('panel-header')}
            <NativeSlot fill>
              <ScrollView testID="slot-scroll" style={{ flex: 1 }}>
                {Array.from({ length: 30 }, (_, index) => (
                  <Pressable
                    key={index}
                    testID={`slot-row-${index}`}
                    onPress={() => note(`row${index}`)}
                    style={{
                      height: 20,
                      backgroundColor: index % 2 ? '#aaa' : '#ccc',
                    }}
                  />
                ))}
              </ScrollView>
            </NativeSlot>
          </Box>
        </NativeRoot>
        <NativeRoot testID="slot-clip-root" style={{ width: 240, height: 80 }}>
          <Box direction="column" height={60}>
            <NativeSlot>
              <View
                testID="slot-tall"
                style={{ height: 200, backgroundColor: '#0000ff' }}
              />
            </NativeSlot>
          </Box>
        </NativeRoot>
        <NativeRoot testID="slot-keys-root" style={{ width: 240, height: 140 }}>
          <Box direction="column">
            <Box
              testID="slot-focus-before"
              accessibilityRole="button"
              focusable
              color={0x444444}
              height={20}
              onKeyDown={(event: { key: string }) =>
                note(`before:${event.key}`)
              }
            />
            <Box
              testID="slot-key-owner"
              direction="column"
              color={0x555555}
              onKeyDown={(event: { key: string }) => note(`owner:${event.key}`)}
            >
              <NativeSlot>
                <TextInput
                  testID="slot-input"
                  style={{ height: 30, backgroundColor: '#ffffff' }}
                  onChangeText={setTyped}
                />
              </NativeSlot>
            </Box>
            <Box
              testID="slot-focus-after"
              accessibilityRole="button"
              focusable
              color={0x444444}
              height={20}
              onKeyDown={(event: { key: string }) => note(`after:${event.key}`)}
            />
          </Box>
        </NativeRoot>
        <Text testID="slot-typed">{`typed:${typed}`}</Text>
        <NativeRoot
          testID="slot-popover-root"
          style={{ width: 240, height: 40 }}
        >
          <Box direction="column">
            <Popover
              testID="slot-popover"
              open={popover}
              onToggle={() => setPopover(value => !value)}
              onDismiss={() => {
                note('dismiss');
                setPopover(false);
              }}
            >
              <NativeSlot>
                <Pressable
                  testID="slot-popover-press"
                  onPress={() => note('popover-press')}
                  style={{ height: 30, backgroundColor: '#ff00ff' }}
                />
              </NativeSlot>
            </Popover>
          </Box>
        </NativeRoot>
        <Pressable testID="slot-modal-open" onPress={() => setModal(true)}>
          <Text>modal</Text>
        </Pressable>
        <Modal
          visible={modal}
          transparent
          onRequestClose={() => setModal(false)}
        >
          <View style={{ padding: 20 }}>
            <NativeRoot
              testID="slot-modal-root"
              style={{ width: 200, height: 60 }}
            >
              <Box direction="column">
                <Box
                  testID="slot-modal-box"
                  color={0x00aa00}
                  height={40}
                  onPress={() => {
                    note('modal-box');
                    setModal(false);
                  }}
                />
              </Box>
            </NativeRoot>
          </View>
        </Modal>
        <Pressable
          testID="slot-toggle"
          onPress={() => setShown(value => !value)}
        >
          <Text>toggle</Text>
        </Pressable>
        <Pressable
          testID="slot-grow"
          onPress={() => setLines(value => value * 12)}
        >
          <Text>grow</Text>
        </Pressable>
      </View>
    </Where.Provider>
  );
}
