module.exports = {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
  overrides: [
    {
      // Runtime sources and tester probes contain Flow annotations, some
      // without a pragma. The CLI packages are plain ESM and keep the default.
      files: ['packages/core/**/*.js', 'tester/**/*.js'],
      options: { parser: 'flow' },
    },
  ],
};
