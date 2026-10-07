#!/usr/bin/env node
// Configures and builds rn_gpui_core with plain CMake: no Cargo, no autolink
// input, no app TurboModules. Mirrors the defines build.rs passes, minus the
// app-specific ones.
//
// Usage:
//   node scripts/check-standalone-cmake.mjs <cxxbridge-include-dir> <generated-rncore-dir> [build-dir]
//
// The cxx bridge include dir is the `out/cxxbridge-include` of a previous
// `cargo build -p rn-gpui-sys`, and the generated rncore dir is its
// `out/fbreactnativespec`. Both are inputs CMake needs and do not carry app
// specs.
//
// Pass a build dir that already has a native-deps cache, such as the cargo
// CMake dir packages/rn-gpui-tester/desktop/build/target/rn-gpui-cmake/
// aarch64-apple-darwin/Debug/build. A fresh dir fails while building the
// OpenSSL apps/ tools (clang "'inttypes.h' file not found"), because the
// native-deps cache lives at CMAKE_BINARY_DIR/native-deps. The default build
// dir is a scratch directory under the OS temp dir and hits that failure.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const cppDir = path.join(packageDir, 'ReactGpui', 'rn-gpui-sys', 'cpp');
const reactCommonDir = path.join(
  repoRoot,
  'node_modules',
  'react-native',
  'ReactCommon',
);
const reactCxxPlatformDir = path.join(packageDir, 'ReactCxxPlatform');
const overridesDir = path.join(packageDir, 'ReactCommonOverrides');

const [, , bridgeArg, rncoreArg, buildArg] = process.argv;
if (!bridgeArg || !rncoreArg) {
  console.error(
    'usage: check-standalone-cmake.mjs <cxxbridge-include-dir> <generated-rncore-dir> [build-dir]',
  );
  process.exit(2);
}
const bridgeDir = path.resolve(bridgeArg);
const rncoreDir = path.resolve(rncoreArg);
if (!existsSync(path.join(bridgeDir, 'rust', 'cxx.h'))) {
  console.error(`missing ${path.join(bridgeDir, 'rust', 'cxx.h')}`);
  process.exit(2);
}
const buildDir = path.resolve(
  buildArg ?? path.join(os.tmpdir(), 'rn-gpui-standalone-cmake'),
);
mkdirSync(buildDir, { recursive: true });

const cmake = args => {
  const result = spawnSync('cmake', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

cmake([
  '-S',
  cppDir,
  '-B',
  buildDir,
  '-DCMAKE_BUILD_TYPE=Debug',
  `-DREACT_COMMON_DIR=${reactCommonDir}`,
  `-DREACT_CXX_PLATFORM_DIR=${reactCxxPlatformDir}`,
  `-DRN_GPUI_OVERRIDES_DIR=${overridesDir}`,
  `-DRN_GPUI_CXXBRIDGE_INCLUDE_DIR=${bridgeDir}`,
  `-DRN_GPUI_GENERATED_RNCORE_DIR=${rncoreDir}`,
]);
cmake(['--build', buildDir, '--target', 'rn_gpui_core', '--parallel']);
console.log(`rn_gpui_core built in ${buildDir}`);
