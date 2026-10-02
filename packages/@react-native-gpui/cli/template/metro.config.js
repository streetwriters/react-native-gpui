// The platform package's Metro resolver applies gpui source overrides and
// handles React Native's platform entry-point rewrite. Include ancestor
// node_modules too, which supports workspaces and monorepo app folders.
const fs = require('fs');
const path = require('path');
const {mergeConfig} = require('@react-native/metro-config');
const platformConfig = require('react-native-gpui/metro.config');
const nodeModulesPaths = [];
for (let directory = __dirname; ; directory = path.dirname(directory)) {
  const candidate = path.join(directory, 'node_modules');
  if (fs.existsSync(candidate)) nodeModulesPaths.push(candidate);
  if (path.dirname(directory) === directory) break;
}
module.exports = mergeConfig(platformConfig, {
  watchFolders: nodeModulesPaths.filter(candidate => !candidate.startsWith(`${__dirname}${path.sep}`)),
  resolver: {nodeModulesPaths},
});
