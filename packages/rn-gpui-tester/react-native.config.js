const path = require('node:path');
module.exports = {
  // This workspace is a desktop test harness. RN CLI 20.2's built-in
  // run-ios/run-android option lists conflict with the CLI's global verbose
  // option, and this app has no native mobile projects to launch.
  commands: [
    'build-android',
    'build-ios',
    'log-android',
    'log-ios',
    'run-android',
    'run-ios',
  ].map(name => ({
    name,
    description: `${name} is not configured for rn-gpui-tester`,
    func: () => {
      throw new Error(`${name} is not configured for rn-gpui-tester`);
    },
  })),
  project: { desktop: {} },
  reactNativePath: path.dirname(require.resolve('react-native/package.json')),
};
