const path = require('path');
const { makeMetroConfig } = require('react-native-gpui/metro.config');

const config = makeMetroConfig({
  projectRoot: path.resolve(__dirname, '..'),
});
const projectRoot = path.resolve(__dirname, '..');
const reactNativeSetup = require.resolve('react-native/setup-env', {
  paths: [projectRoot],
});
const gpuiSetup = require.resolve('react-native-gpui/setup-env.js', {
  paths: [projectRoot],
});
const getModulesRunBeforeMainModule =
  config.serializer?.getModulesRunBeforeMainModule;
config.serializer = {
  ...config.serializer,
  getModulesRunBeforeMainModule: () =>
    (getModulesRunBeforeMainModule?.() ?? []).map(module =>
      module === reactNativeSetup ||
      module.replaceAll('\\', '/').endsWith('/react-native/src/setup-env.js')
        ? gpuiSetup
        : module,
    ),
};

// Fixtures and platform packages must share the app's React/Worklets copies.
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
