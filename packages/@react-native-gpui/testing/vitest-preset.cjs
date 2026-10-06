const path = require('node:path');
const gpuiRoot = path.resolve(__dirname, '../../react-native-gpui');

module.exports = {
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [path.join(__dirname, 'vitest/setup.ts')],
    server: {
      deps: {
        inline: ['react-native'],
      },
    },
  },
  resolve: {
    conditions: ['react-native', 'node'],
    extensions: [
      '.gpui.tsx',
      '.gpui.ts',
      '.gpui.jsx',
      '.gpui.js',
      '.native.tsx',
      '.native.ts',
      '.native.jsx',
      '.native.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.mjs',
      '.json',
    ],
    alias: [
      {
        find: /^react-native\/Libraries\/Utilities\/Platform$/,
        replacement: path.join(
          gpuiRoot,
          'src-gpui/Libraries/Utilities/Platform.gpui.js',
        ),
      },
      {
        find: /^react-native\/Libraries\/NativeComponent\/BaseViewConfig(?:\.ios)?$/,
        replacement: path.join(
          gpuiRoot,
          'src-gpui/Libraries/NativeComponent/BaseViewConfig.gpui.ts',
        ),
      },
      {
        find: /^@react-native-gpui\/NativeViewHost$/,
        replacement: path.join(__dirname, 'vitest/NativeViewHostMock.tsx'),
      },
    ],
  },
  optimizeDeps: {
    exclude: ['react-native'],
  },
  define: {
    __DEV__: 'true',
  },
};
