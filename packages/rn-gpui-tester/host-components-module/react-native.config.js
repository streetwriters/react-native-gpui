module.exports = {
  dependency: {
    platforms: {
      desktop: {
        crate: 'rn-gpui-host-components-fixture',
        hostComponents: [
          { name: 'FixtureChart' },
          { name: 'FixtureMeasuredLabel', measured: true },
          { name: 'FixtureCard', container: true },
          { name: 'FixtureNativeProbe', nativeSurface: true },
          { name: 'FixtureWebView', nativeSurface: true },
        ],
      },
    },
  },
};
