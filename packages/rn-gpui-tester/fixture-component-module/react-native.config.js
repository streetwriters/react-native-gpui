module.exports = {
  dependency: {
    platforms: {
      desktop: {
        cmake: 'desktop',
        crate: 'rn-gpui-fixture-badge',
        componentDescriptors: ['FixtureBadgeComponentDescriptor'],
        componentHeaders: [
          'react/renderer/components/FixtureComponentModuleSpec/ComponentDescriptors.h',
        ],
      },
    },
  },
};
