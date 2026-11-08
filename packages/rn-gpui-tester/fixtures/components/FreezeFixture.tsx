/**
 * Routes kept mounted and frozen with react-freeze while inactive.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Freeze } from 'react-freeze';

const ROUTES = ['home', 'notebook', 'tag'] as const;
type Route = (typeof ROUTES)[number];

function Screen({ name }: { name: Route }) {
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState(40);
  useEffect(() => {
    const timer = setInterval(() => setRows(value => (value % 5) + 40), 200);
    return () => clearInterval(timer);
  }, []);
  return (
    <View testID={`route-${name}`}>
      <Text testID={`route-${name}-title`}>{`${name} ${count}`}</Text>
      <Pressable
        testID={`route-${name}-bump`}
        onPress={() => setCount(c => c + 1)}
      >
        <Text>bump</Text>
      </Pressable>
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
