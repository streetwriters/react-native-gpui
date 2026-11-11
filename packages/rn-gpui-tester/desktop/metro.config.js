const path = require('path');
const { makeMetroConfig } = require('@react-native-gpui/core/metro.config');

const config = makeMetroConfig({
  projectRoot: path.resolve(__dirname, '..'),
});

// Fixtures and platform packages must share the app's React/Worklets copies.
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
