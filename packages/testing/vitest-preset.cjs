const path = require('node:path');
const gpuiRoot = path.resolve(__dirname, '../core');

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
      '.desktop.tsx',
      '.desktop.ts',
      '.desktop.jsx',
      '.desktop.js',
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
        // React Native's own entry is Flow-typed and cannot be parsed by vitest,
        // so a module in `src-gpui` that imports `TurboModuleRegistry` from the
        // package root — the convention there, and what `Platform.desktop.js` does
        // — would fail to load in a unit test and leave the registry undefined.
        // The mock exposes what those modules use; tests install what the native
        // side should report through `globalThis.__rnGpuiTestTurboModules`.
        find: /^react-native$/,
        replacement: path.join(__dirname, 'vitest/ReactNativeMock.js'),
      },
      {
        find: /^react-native\/Libraries\/Utilities\/Platform$/,
        replacement: path.join(
          gpuiRoot,
          'src-gpui/Libraries/Utilities/Platform.desktop.js',
        ),
      },
      {
        find: /^react-native\/Libraries\/NativeComponent\/BaseViewConfig(?:\.ios)?$/,
        replacement: path.join(
          gpuiRoot,
          'src-gpui/Libraries/NativeComponent/BaseViewConfig.desktop.ts',
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
