module.exports = {
  dependency: {
    platforms: {
      gpui: {
        cmake: 'gpui',
        cppProvider: 'create_cpp_example_module',
        componentDescriptors: ['GpuiTestBoxComponentDescriptor'],
        componentHeaders: [
          'react/renderer/components/NativeCppExampleSpec/ComponentDescriptors.h',
        ],
      },
    },
  },
};
