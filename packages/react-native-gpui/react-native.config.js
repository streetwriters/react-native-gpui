// react-native-gpui platform registration for the React Native CLI and Metro.
// Modeled on react-native-windows' react-native.config.js platform entry.
module.exports = {
  platforms: {
    gpui: {
      npmPackageName: 'react-native-gpui',
      // Directory inside this package that holds platform-specific JS overrides.
      sourceDir: __dirname,
      // Autolinking: native Rust/C++ components register through these config keys.
      config: {
        dependency: {
          assets: [],
        },
      },
    },
  },
};
