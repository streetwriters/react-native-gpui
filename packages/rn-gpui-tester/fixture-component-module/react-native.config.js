module.exports = {
  dependency: {
    platforms: {
      gpui: {
        cmake: 'gpui',
        crate: 'rn-gpui-fixture-badge',
        componentDescriptors: ['FixtureBadgeComponentDescriptor'],
        componentHeaders: [
          'react/renderer/components/FixtureComponentModuleSpec/ComponentDescriptors.h',
        ],
      },
    },
  },
};
