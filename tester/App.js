// TODO 1.8 — the first-milestone app from design doc §18.16.
//
// Exercises the mount path: a flex container, a fixed-size view, a Text
// (paragraph) and a Pressable that updates state on press.

import React, {useState} from 'react';
import {AppRegistry, View, Text, Pressable} from 'react-native';

function App() {
  const [n, setN] = useState(0);
  return (
    <View style={{flex: 1, backgroundColor: '#f5f5f5', padding: 24, gap: 12}}>
      <View
        style={{width: 120, height: 60, backgroundColor: '#3b82f6', borderRadius: 12}}
      />
      <Text style={{fontSize: 20, color: '#111'}}>
        Hello from React Native on GPUI
      </Text>
      <Pressable
        onPress={() => setN(n + 1)}
        style={{
          padding: 12,
          backgroundColor: '#10b981',
          borderRadius: 8,
          alignSelf: 'flex-start',
        }}>
        <Text style={{color: 'white'}}>Pressed {n} times</Text>
      </Pressable>
    </View>
  );
}

AppRegistry.registerComponent('App', () => App);

// Export the root component so Metro can treat this module as a Fast Refresh
// boundary. AppRegistry keeps the initial component type, and React Refresh
// updates that type in place when this module changes.
export default App;
