module.exports = {
  dependency: {
    platforms: {
      desktop: {
        // A host component needs no C++ of its own: core provides the props
        // class, the shadow node and the descriptor. What the platform needs is
        // the list of names, so autolink can verify the package registered each
        // one and knows which measure themselves.
        crate: 'rn-gpui-host-components-fixture',
        hostComponents: [
          { name: 'FixtureChart' },
          { name: 'FixtureMeasuredLabel', measured: true },
          { name: 'FixtureCard', container: true },
        ],
      },
    },
  },
};
