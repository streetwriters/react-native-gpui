// Minimal Metro config — enough to produce a bundle with `npx react-native
// bundle`. TODO 2.1 extends this for the dev server: a `gpui` platform in
// `resolver.platforms` and the `react-native` -> `react-native-gpui` alias.
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

module.exports = mergeConfig(getDefaultConfig(__dirname), {});
