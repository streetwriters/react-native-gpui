module.exports = {
  preset: '@react-native-gpui/testing',
  roots: ['<rootDir>/tester'],
  testMatch: ['**/__tests__/**/*.test.{js,ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  clearMocks: true,
};
