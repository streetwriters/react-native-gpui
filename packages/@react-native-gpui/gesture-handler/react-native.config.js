module.exports = {
  dependency: {
    platforms: {
      gpui: {
        cmake: 'gpui',
        cppProvider: 'create_gpui_gesture_handler_module',
        componentCodegenPackage: 'react-native-gesture-handler',
        componentDescriptors: [
          'RNGestureHandlerButtonComponentDescriptor',
          'RNGestureHandlerRootViewComponentDescriptor',
        ],
        componentHeaders: [
          'react/renderer/components/rngesturehandler_codegen/ComponentDescriptors.h',
        ],
      },
    },
  },
};
