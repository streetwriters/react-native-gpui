// The package's JS entry, exactly as a third-party addon package would write
// it: one `require` of the binary `node-gyp` produced. The Babel plugin turns
// that into `_requireNodeLibrary(key, path)`.
//
// The binary is built by `scripts/build-node-addon.mjs` before the bundle, so
// the require always has a file to resolve to. If the build were skipped the
// plugin would emit a throwing expression instead and the bundle would still
// build, but the screen would fail rather than silently pass.
module.exports = require('../build/addon.node');
