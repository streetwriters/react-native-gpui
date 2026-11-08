/**
 * Routes kept mounted and frozen with react-freeze while inactive.
 *
 * @format
 */

import React, {
  Activity,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Freeze } from 'react-freeze';

const listeners = new Set<() => void>();
let version = 0;
setInterval(() => {
  version += 1;
  listeners.forEach(listener => listener());
}, 100);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const ROUTES = ['home', 'notebook', 'tag'] as const;
type Route = (typeof ROUTES)[number];

function Screen({ name }: { name: Route }) {
  const [count, setCount] = useState(0);
  const external = useSyncExternalStore(subscribe, () => version);
  const [rows, setRows] = useState(40);
  useEffect(() => {
    const timer = setInterval(() => setRows(value => (value % 5) + 40), 200);
    return () => clearInterval(timer);
  }, []);
  return (
    <View testID={`route-${name}`}>
      <Text
        testID={`route-${name}-title`}
      >{`${name} ${count} ${external % 2}`}</Text>
      <View style={{ height: 120 }}>
        <FlatList
          data={Array.from({ length: 50 + (rows % 5) }, (_, index) => index)}
          keyExtractor={item => String(item)}
          renderItem={({ item }) => (
            <Text
              style={{ height: 20 }}
            >{`${name} row ${item} ${external % 2}`}</Text>
          )}
        />
      </View>
      <Pressable
        testID={`route-${name}-bump`}
        onPress={() => setCount(c => c + 1)}
      >
        <Text>bump</Text>
      </Pressable>
    </View>
  );
}

function KeyList({ name }: { name: string }) {
  const [keys, setKeys] = useState(0);
  const [presses, setPresses] = useState(0);
  return (
    <View
      testID={`${name}-list`}
      focusable
      onKeyDown={() => setKeys(k => k + 1)}
    >
      <Pressable
        testID={`${name}-row`}
        onPress={() => setPresses(p => p + 1)}
        style={{ height: 24 }}
      >
        <Text>{`${name} row`}</Text>
      </Pressable>
      <Text testID={`${name}-keys`}>{`${keys}`}</Text>
      <Text testID={`${name}-presses`}>{`${presses}`}</Text>
    </View>
  );
}

function HideCycle() {
  const [visible, setVisible] = useState(true);
  return (
    <View style={{ gap: 4 }}>
      <Text testID="hide-toggle" onPress={() => setVisible(value => !value)}>
        {visible ? 'hide' : 'show'}
      </Text>
      <Activity mode={visible ? 'visible' : 'hidden'}>
        <KeyList name="activity" />
      </Activity>
      <Freeze freeze={!visible}>
        <KeyList name="freeze" />
      </Freeze>
    </View>
  );
}

export default function FreezeFixture() {
  const [route, setRoute] = useState<Route>('home');
  const [visited, setVisited] = useState<Route[]>(['home']);
  const go = (next: Route) => {
    setRoute(next);
    setVisited(previous =>
      previous.includes(next) ? previous : [...previous, next],
    );
  };
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text
        testID="js-busy"
        onPress={() => {
          const end = Date.now() + 4000;
          while (Date.now() < end) {
            // keep the JS thread busy
          }
        }}
      >
        busy
      </Text>
      <HideCycle />
      {ROUTES.map(name => (
        <Text key={name} testID={`go-${name}`} onPress={() => go(name)}>
          {`go ${name}`}
        </Text>
      ))}
      {visited.map(name => (
        <Freeze key={name} freeze={name !== route}>
          <Screen name={name} />
        </Freeze>
      ))}
    </View>
  );
}
