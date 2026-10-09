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
