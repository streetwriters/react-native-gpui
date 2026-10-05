const path = require('node:path');
const reactNativePreset = require('@react-native/jest-preset');

const packageRoot = __dirname;
const rnRoot = path.dirname(require.resolve('react-native/package.json'));
const gpuiRoot = path.resolve(packageRoot, '../../react-native-gpui');

module.exports = {
  ...reactNativePreset,
  resolver: path.join(packageRoot, 'jest/resolver.cjs'),
  haste: {
    ...reactNativePreset.haste,
    defaultPlatform: 'gpui',
    platforms: ['gpui', 'ios', 'android', 'native'],
  },
  moduleNameMapper: {
    ...reactNativePreset.moduleNameMapper,
    '^.*react-native/Libraries/Utilities/Platform(?:\\.js)?$': path.join(
      gpuiRoot,
      'src-gpui/Libraries/Utilities/Platform.gpui.js',
    ),
    '^.*react-native/Libraries/Utilities/Platform\\.ios\\.js$': path.join(
      gpuiRoot,
      'src-gpui/Libraries/Utilities/Platform.gpui.js',
    ),
    '^react-native/Libraries/Utilities/Platform$': path.join(
      gpuiRoot,
      'src-gpui/Libraries/Utilities/Platform.gpui.js',
    ),
    '^react-native/Libraries/NativeComponent/BaseViewConfig$': path.join(
      gpuiRoot,
      'src-gpui/Libraries/NativeComponent/BaseViewConfig.gpui.ts',
    ),
    '^react-native/Libraries/NativeComponent/BaseViewConfig\\.ios$': path.join(
      gpuiRoot,
      'src-gpui/Libraries/NativeComponent/BaseViewConfig.gpui.ts',
    ),
    '^@react-native-gpui/NativeViewHost$': path.join(
      packageRoot,
      'jest/NativeViewHostMock.tsx',
    ),
    '^react-native-gpui/NativeViewHost$': path.join(
      packageRoot,
      'jest/NativeViewHostMock.tsx',
    ),
  },
  modulePaths: [...(reactNativePreset.modulePaths ?? []), rnRoot],
};
