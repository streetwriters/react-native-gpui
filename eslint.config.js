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
      'examples/*/android/',
      'examples/*/ios/',
      'examples/*/desktop/autolink/',
    ],
  },
  // eslint-plugin-ft-flow still uses the ESLint 8 rule context API.
  ...fixupConfigRules(reactNativeConfig),
  {
    // Node tooling: CLI, codegen, build scripts and config files.
    files: [
      'packages/@react-native-gpui/cli/**/*.js',
      'packages/@react-native-gpui/codegen/**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.config.js',
      '**/react-native.config.js',
    ],
    languageOptions: {
      sourceType: 'module',
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
    files: ['packages/react-native-gpui/**/*.js', 'tester/**/*.js'],
    languageOptions: {
      parser: hermesParser,
      parserOptions: { sourceType: 'module' },
      globals: {
        // Flow utility types.
        NonNullable: 'readonly',
        Readonly: 'readonly',
        ReadonlyArray: 'readonly',
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
];
