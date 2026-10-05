const path = require('node:path');
process.env.RN_GPUI_TEST_PROJECT = path.resolve(__dirname, '..');
module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  preset: '@react-native-gpui/testing/jest-preset-e2e',
  testMatch: ['<rootDir>/desktop/e2e/**/*.e2e.ts'],
};
