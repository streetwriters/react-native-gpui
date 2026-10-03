const path = require('path');

module.exports = {
  project: { gpui: {} },
  // Keep the CLI from looking for Apple/Android project files in the tester.
  reactNativePath: path.dirname(require.resolve('react-native/package.json')),
};
