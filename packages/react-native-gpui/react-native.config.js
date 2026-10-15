module.exports = {
  platforms: {
    gpui: {
      npmPackageName: 'react-native-gpui',
      // The Rust crate builds the platform; there is no Gradle/Xcode project to
      // configure or to autolink dependencies against. `project.gpui` only
      // carries build options, which autolink validates.
      projectConfig: (_root, project) => project ?? {},
      dependencyConfig: (_root, dependencyConfig) => dependencyConfig ?? null,
    },
  },
};
