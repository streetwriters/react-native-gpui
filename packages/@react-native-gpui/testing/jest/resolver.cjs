const path = require('node:path');
const reactNativeResolver = require('@react-native/jest-preset/jest/resolver');

const platformPath = path.resolve(
  __dirname,
  '../../../react-native-gpui/src-gpui/Libraries/Utilities/Platform.gpui.js',
);

module.exports = (request, options) => {
  if (
    request === './Platform' &&
    options.basedir.includes('/react-native/Libraries/Utilities')
  ) {
    return platformPath;
  }

  return reactNativeResolver(request, options);
};
