module.exports = {
  dependency: {
    platforms: {
      gpui: {
        cmake: 'gpui',
        jsEngine: {
          name: 'hermes',
          register: 'rn_gpui_register_js_engine_hermes',
          bundle: './gpui/bundle.js',
          runtimeFiles: './gpui/runtime-files.js',
        },
      },
    },
  },
};
