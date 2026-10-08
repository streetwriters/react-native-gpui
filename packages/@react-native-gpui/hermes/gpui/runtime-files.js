// Shared libraries this engine package must ship next to the app executable
// (or in Contents/Frameworks). Core's packaging and rn-gpui's run-time staging
// call this instead of knowing "hermesvm".
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

const PLATFORM_DIRECTORIES = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'win32-x64': 'win32-x64',
  'win32-arm64': 'win32-arm64',
};

const LIBRARY_NAMES = {
  darwin: 'libhermesvm.dylib',
  linux: 'libhermesvm.so',
  win32: 'hermesvm.dll',
};

/** Absolute paths of the shared libraries to stage for `platform`/`arch`. */
module.exports = (platform, arch) => {
  const directory = PLATFORM_DIRECTORIES[`${platform}-${arch}`];
  if (!directory) return [];
  const library = LIBRARY_NAMES[platform];
  if (!library) return [];
  const candidate = path.join(PACKAGE_ROOT, 'bin', directory, library);
  return fs.existsSync(candidate) ? [candidate] : [];
};
