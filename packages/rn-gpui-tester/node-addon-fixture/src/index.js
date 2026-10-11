// The package's JS entry, exactly as a third-party addon package would write
// it: one `require` of the binary `node-gyp` produced. The Babel plugin turns
// that into `_requireNodeLibrary(key, path)`.
//
// On Windows the binary is not built (Part D1), so the require has no file to
// resolve to; the plugin then emits a throwing expression and the bundle still
// builds. Nothing here needs a placeholder for that case.
module.exports = require('../build/addon.node');
