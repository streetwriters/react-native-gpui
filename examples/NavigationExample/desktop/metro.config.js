const path = require('path');
const { makeMetroConfig } = require('react-native-gpui/metro.config');

const config = makeMetroConfig({
  projectRoot: path.resolve(__dirname, '..'),
});

// Shared e2e fixtures live outside the app project.
config.watchFolders.push(path.resolve(__dirname, '../../../tester'));
// Fixtures and platform packages must share the app's React/Worklets copies.
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
