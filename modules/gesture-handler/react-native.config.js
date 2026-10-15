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
        // Metro: replace these files of installed packages for gpui.
        sourceOverrides: {
          'react-native-gesture-handler/src/handlers/customDirectEventTypes.ts':
            './src/customDirectEventTypes.gpui.ts',
          'react-native-gesture-handler/src/v3/components/GestureButtons.tsx':
            './src/GestureButtons.gpui.tsx',
        },
      },
    },
  },
};
