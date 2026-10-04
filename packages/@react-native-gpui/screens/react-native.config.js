module.exports = {
  dependency: {
    platforms: {
      gpui: {
        cmake: 'gpui',
        componentCodegenPackage: 'react-native-screens',
        componentDescriptors: [
          'RNSScreenComponentDescriptor',
          'RNSScreenContainerComponentDescriptor',
          'RNSScreenContentWrapperComponentDescriptor',
          'RNSScreenNavigationContainerComponentDescriptor',
          'RNSScreenStackComponentDescriptor',
          'RNSScreenStackHeaderConfigComponentDescriptor',
          'RNSScreenStackHeaderSubviewComponentDescriptor',
          'RNSModalScreenComponentDescriptor',
          'RNSFullWindowOverlayComponentDescriptor',
        ],
        componentHeaders: [
          'react/renderer/components/rnscreens/ComponentDescriptors.h',
          'react/renderer/components/rnscreens/RNSScreenComponentDescriptor.h',
          'react/renderer/components/rnscreens/RNSScreenStackHeaderConfigComponentDescriptor.h',
          'react/renderer/components/rnscreens/RNSScreenStackHeaderSubviewComponentDescriptor.h',
          'react/renderer/components/rnscreens/RNSModalScreenComponentDescriptor.h',
          'react/renderer/components/rnscreens/RNSFullWindowOverlayComponentDescriptor.h',
        ],
      },
    },
  },
};
