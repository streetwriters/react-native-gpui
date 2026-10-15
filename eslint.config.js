const { fixupConfigRules } = require('@eslint/compat');
const hermesParser = require('hermes-eslint');
const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  {
    ignores: [
      '**/node_modules/',
      '**/target/',
      '**/build/',
      'packages/testing/dist/',
      '.local/',
      'desktop/',
      'packages/core/bin/',
      'packages/core/ReactCxxPlatform/',
      'packages/core/ReactCommonOverrides/',
      // Vendored facebook/hermes sources, kept byte-identical to the pin.
      'packages/hermes/API/',
      'packages/hermes/include/',
      'packages/hermes/public/',
      'packages/rn-gpui-tester/desktop/autolink/',
    ],
  },
  // eslint-plugin-ft-flow still uses the ESLint 8 rule context API.
  ...fixupConfigRules(reactNativeConfig),
  {
    files: [
      '.prettierrc.js',
      '**/.prettierrc.js',
      'packages/cli/**/*.js',
      'packages/codegen/**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.config.js',
      '**/react-native.config.js',
      'modules/*/gpui/**/*.js',
      'packages/hermes/gpui/**/*.js',
      // Plain-JS mocks the vitest preset substitutes; they live outside any
      // package that has a Babel config, so they are parsed as modules here.
      'packages/testing/vitest/**/*.js',
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
    files: ['packages/core/**/*.js', 'packages/rn-gpui-tester/**/*.js'],
    ignores: ['packages/core/babel-plugin-node-addons*.js'],
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
    // The Node addon Babel plugin is plain CommonJS Node code, not a Flow
    // source: it is loaded by Babel in the Metro process.
    files: ['packages/core/babel-plugin-node-addons*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      parserOptions: { requireConfigFile: false },
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
      },
    },
  },
  {
    // `no-unreachable` misreads Flow `component` declarations.
    files: ['packages/core/src-gpui/**/*.js'],
    rules: { 'no-unreachable': 'off' },
  },
  {
    files: ['packages/rn-gpui-tester/**/*.{ts,tsx,js}'],
    rules: { 'react-native/no-inline-styles': 'off' },
  },
];
