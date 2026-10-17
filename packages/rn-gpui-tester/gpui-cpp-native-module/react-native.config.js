module.exports = {
  dependency: {
    platforms: {
      desktop: {
        cmake: 'desktop',
        cppProvider: 'create_cpp_example_module',
        componentDescriptors: ['GpuiTestBoxComponentDescriptor'],
        componentHeaders: [
          'react/renderer/components/NativeCppExampleSpec/ComponentDescriptors.h',
        ],
      },
    },
  },
};
