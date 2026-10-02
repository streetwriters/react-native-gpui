// Shipped platform registration: an app that depends on `react-native-gpui`
// gets the `gpui` platform (and therefore `--platform gpui` bundling) without
// writing any config of its own. `npmPackageName` is what makes the CLI add
// `gpui` to Metro's `resolver.platforms` and rewrite `react-native` imports to
// this package. `metro.config.js` in this repo documents the two resolver
// corrections that rewriting needs.
module.exports = {
  platforms: {
    gpui: {
      npmPackageName: 'react-native-gpui',
      // The Rust crate builds the platform; there is no Gradle/Xcode project to
      // configure or to autolink dependencies against.
      projectConfig: () => null,
      dependencyConfig: (_root, dependencyConfig) => dependencyConfig ?? null,
    },
  },
};
