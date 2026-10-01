// Entry point for the Metro dev server, which resolves the bundle URL path to a
// file in the project root: `http://localhost:8081/index.bundle?platform=gpui`
// becomes `<repo root>/index.js`. The tester application itself lives in
// `tester/`, so this re-exports it.
require('./tester');
