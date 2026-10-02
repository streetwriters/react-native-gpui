// Platform registration for the `gpui` platform.
//
// `npmPackageName` is what tells the React Native CLI (and through it Metro)
// two things when bundling with `--platform gpui`:
//
//   1. add `gpui` to `resolver.platforms`, so `Foo.gpui.js` is preferred over
//      `Foo.js`;
//   2. rewrite `react-native` (and `react-native/...`) imports to this package,
//      so apps import the gpui surface without changing their code.
//
// `metro.config.js` in this repo is the reference implementation of the two
// corrections that rewriting needs (see the comments there).
const path = require('path');

// Resolves through the workspace symlink to `packages/react-native-gpui`.
const gpuiPackageDir = path.dirname(
  require.resolve('react-native-gpui/package.json'),
);

module.exports = {
  platforms: {
    gpui: {
      npmPackageName: 'react-native-gpui',
      // The platform has no Gradle/Xcode project to link: everything below is
      // built by the Rust crate (see packages/react-native-gpui/ReactGpui).
      projectConfig: () => null,
      dependencyConfig: (_root, dependencyConfig) => dependencyConfig ?? null,
    },
  },
  project: {
    gpui: {},
  },
  // Keep the CLI from looking for apple/android project files in the tester.
  reactNativePath: path.dirname(require.resolve('react-native/package.json')),
};
