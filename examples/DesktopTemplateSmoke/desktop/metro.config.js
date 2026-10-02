// GPUI-specific Metro setup. Keep the app's standard root metro.config.js for
// iOS/Android and point only run-desktop at this platform config.
const fs = require('fs');
const path = require('path');
const {mergeConfig} = require('@react-native/metro-config');
const platformConfig = require('react-native-gpui/metro.config');
const nodeModulesPaths = [];
for (let directory = process.cwd(); ; directory = path.dirname(directory)) {
  const candidate = path.join(directory, 'node_modules');
  if (fs.existsSync(candidate)) nodeModulesPaths.push(candidate);
  if (path.dirname(directory) === directory) break;
}
const watchFolders = [...new Set([...(platformConfig.watchFolders || []), ...nodeModulesPaths])];
const resolverPaths = [...new Set([...(platformConfig.resolver.nodeModulesPaths || []), ...nodeModulesPaths])];
module.exports = mergeConfig(platformConfig, {
  watchFolders,
  resolver: {nodeModulesPaths: resolverPaths},
});
