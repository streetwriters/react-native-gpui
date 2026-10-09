const { fixupConfigRules } = require('@eslint/compat');
const hermesParser = require('hermes-eslint');
const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  {
    ignores: [
      '**/node_modules/',
      '**/target/',
      '**/build/',
      'packages/@react-native-gpui/testing/dist/',
      '.local/',
      'desktop/',
      'packages/react-native-gpui/bin/',
      'packages/react-native-gpui/ReactCxxPlatform/',
      'packages/react-native-gpui/ReactCommonOverrides/',
      // Vendored facebook/hermes sources, kept byte-identical to the pin.
      'packages/@react-native-gpui/hermes/API/',
      'packages/@react-native-gpui/hermes/include/',
      'packages/@react-native-gpui/hermes/public/',
      'packages/rn-gpui-tester/desktop/autolink/',
    ],
  },
  // eslint-plugin-ft-flow still uses the ESLint 8 rule context API.
  ...fixupConfigRules(reactNativeConfig),
  {
    files: [
      '.prettierrc.js',
      '**/.prettierrc.js',
      'packages/@react-native-gpui/cli/**/*.js',
      'packages/@react-native-gpui/codegen/**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.config.js',
      '**/react-native.config.js',
      'packages/@react-native-gpui/*/gpui/**/*.js',
    ],
    languageOptions: {
      sourceType: 'module',
      parserOptions: { requireConfigFile: false },
      globals: {
        AbortSignal: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
      },
    },
  },
  {
    // Flow sources: @babel/eslint-parser crashes on template literals once
    // the RN preset switches to the Hermes parser, so lint them with
    // hermes-eslint like React Native itself does.
    files: [
      'packages/react-native-gpui/**/*.js',
      'packages/rn-gpui-tester/**/*.js',
    ],
    languageOptions: {
      parser: hermesParser,
      parserOptions: { sourceType: 'module' },
      globals: {
        NonNullable: 'readonly',
        Readonly: 'readonly',
        ReadonlyArray: 'readonly',
        Stringish: 'readonly',
      },
    },
    rules: {
      // hermes-eslint resolves Flow type references itself.
      'ft-flow/define-flow-type': 'off',
      'ft-flow/use-flow-type': 'off',
    },
  },
  {
    // `no-unreachable` misreads Flow `component` declarations.
    files: ['packages/react-native-gpui/src-gpui/**/*.js'],
    rules: { 'no-unreachable': 'off' },
  },
  {
    files: ['packages/rn-gpui-tester/**/*.{ts,tsx,js}'],
    rules: { 'react-native/no-inline-styles': 'off' },
  },
];
