module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'module:react-native-gpui/babel-plugin-node-addons',
    'react-native-worklets/plugin',
  ],
};
