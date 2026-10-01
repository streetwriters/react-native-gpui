// TODO 1.7 — minimal bundle entry point.
//
// Proves the JS side of the first milestone: the engine evaluates this module
// and `console.log` reaches the C++ logger. The §18.16 tester app replaces this
// in TODO 1.8/1.9.
//
// The log is deliberately the first statement: `react-native`'s dev-only setup
// (`setUpReactDevTools`) requires iOS-only native modules that the cxx platform
// does not register yet (TODO 2.1 adds the `gpui` Metro platform), so anything
// after the require may never run.

console.log('[rn-gpui] JS bundle evaluated');

const React = require('react');
const {AppRegistry, View} = require('react-native');

function App() {
  return React.createElement(View, {
    style: {flex: 1, backgroundColor: '#ffffff'},
  });
}

AppRegistry.registerComponent('App', () => App);

console.log('[rn-gpui] App registered');
