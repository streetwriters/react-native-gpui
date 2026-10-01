// TODO 1.7/1.8 — bundle entry point.
//
// The log is deliberately the first statement: `react-native`'s pre-main setup
// (`react-native/setup-env`, injected by `getModulesRunBeforeMainModule`) runs
// before this module and its dev-only branch requires iOS-only native modules
// that the cxx platform does not register yet (TODO 2.1 adds the `gpui` Metro
// platform), so anything after the require may never run in a dev bundle.

console.log('[rn-gpui] JS bundle evaluated');

require('./App');
require('./probes/TextProbe');

console.log('[rn-gpui] App registered');
require('./probes/ImageProbe');
