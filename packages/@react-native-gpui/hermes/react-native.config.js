module.exports = {
  dependency: {
    platforms: {
      gpui: {
        cmake: 'gpui',
        jsEngine: {
          name: 'hermes',
          register: 'rn_gpui_register_js_engine_hermes',
          runtimeFiles: './gpui/runtime-files.js',
        },
      },
    },
  },
};
