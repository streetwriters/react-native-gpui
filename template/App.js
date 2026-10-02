import React from 'react';
import {AppRegistry, StyleSheet, Text, View} from 'react-native';

function App() {
  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>REACT NATIVE + GPUI</Text>
      <Text style={styles.title}>Your desktop app is ready.</Text>
      <Text style={styles.body}>
        Edit App.js and run `npx rn-gpui run` to rebuild and launch it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {flex: 1, justifyContent: 'center', padding: 48, backgroundColor: '#10151d'},
  eyebrow: {color: '#70d6bd', fontSize: 13, fontWeight: '700', letterSpacing: 2},
  title: {color: '#f5f7fa', fontSize: 34, fontWeight: '700', marginTop: 16},
  body: {color: '#bac3cf', fontSize: 17, lineHeight: 25, marginTop: 12, maxWidth: 520},
});

AppRegistry.registerComponent('App', () => App);
