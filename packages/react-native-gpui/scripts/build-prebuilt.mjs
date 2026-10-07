#!/usr/bin/env node
// Builds the prebuilt C++ runtime for this host and packs it as
// prebuilt-binaries-<platform>.tar.gz with a manifest.json.
//
// Usage:
//   node scripts/build-prebuilt.mjs --version <v> --out <dir> \
//     --bridge <cxxbridge-include> --rncore <generated-rncore-dir> \
//     [--build-dir <dir>] [--native-deps <dir>] [--skip-build] [--jobs <n>]
//
// The bridge and rncore dirs are Cargo OUT_DIR outputs of `cargo build -p
// rn-gpui-sys` (out/cxxbridge-include and out/fbreactnativespec). The build dir
// should already hold a native-deps cache (see check-standalone-cmake.mjs for
// why a fresh dir fails on OpenSSL).
//
// Output (under --out):
//   <platform>/                 the cmake --install prefix (lib/, include/, cmake/)
//   prebuilt-binaries-<platform>.tar.gz
//   prebuilt-binaries-<platform>.tar.gz.sha256

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inputHash } from './prebuilt-inputs.mjs';

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
const reactNativePkg = path.join(
  repoRoot,
  'node_modules',
  'react-native',
  'package.json',
);
const hermesPkg = path.join(
  repoRoot,
  'packages',
  '@react-native-gpui',
  'hermes',
  'package.json',
);
const cargoLock = path.join(packageDir, 'ReactGpui', 'Cargo.lock');

const DEFAULT_BRIDGE = path.join(
  repoRoot,
  'packages/rn-gpui-tester/desktop/build/target/debug/build/rn-gpui-sys-6b9039533cd6e1ed/out/cxxbridge-include',
);
const DEFAULT_NATIVE_DEPS = path.join(
  repoRoot,
  'packages/rn-gpui-tester/desktop/build/target/rn-gpui-cmake/aarch64-apple-darwin/Debug/build/native-deps',
);
const DEFAULT_RNCORE = path.join(
  repoRoot,
  'packages/rn-gpui-tester/desktop/build/target/debug/build/rn-gpui-sys-6b9039533cd6e1ed/out/fbreactnativespec',
);

const args = parseArgs(process.argv.slice(2));
const version = args.version;
const outDir = path.resolve(args.out ?? fail('--out is required'));
const bridgeDir = path.resolve(args.bridge ?? DEFAULT_BRIDGE);
const rncoreDir = path.resolve(args.rncore ?? DEFAULT_RNCORE);
const buildDir = path.resolve(
  args['build-dir'] ?? path.join(os.tmpdir(), 'rn-gpui-prebuilt-build'),
);
// Source of the native-deps cache (OpenSSL, curl, folly sources). A fresh build
// dir cannot build OpenSSL apps/ on macOS, so the cache is linked in.
const nativeDepsSource = path.resolve(
  args['native-deps'] ?? DEFAULT_NATIVE_DEPS,
);
const jobs =
  args.jobs ?? String(os.availableParallelism?.() ?? os.cpus().length);
if (!version) fail('--version is required');
if (!existsSync(path.join(bridgeDir, 'rust', 'cxx.h')))
  fail(`missing ${path.join(bridgeDir, 'rust', 'cxx.h')}`);
if (!existsSync(path.join(rncoreDir, 'jni')))
  fail(`missing ${path.join(rncoreDir, 'jni')}`);

const platform = hostPlatform();
const platformDir = path.join(outDir, platform);
const archiveName = `prebuilt-binaries-${platform}.tar.gz`;
const started = Date.now();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) fail(`unexpected argument ${key}`);
    const name = key.slice(2);
    if (name === 'skip-build') {
      out[name] = true;
    } else {
      out[name] = argv[++i];
    }
  }
  return out;
}

function fail(message) {
  console.error(`build-prebuilt: ${message}`);
  process.exit(2);
}

function hostPlatform() {
  const archMap = { arm64: 'arm64', x64: 'x64' };
  const arch = archMap[process.arch] ?? process.arch;
  if (process.platform === 'darwin') return `darwin-${arch}`;
  if (process.platform === 'linux') return `linux-${arch}`;
  if (process.platform === 'win32') return `win32-${arch}`;
  return `${process.platform}-${arch}`;
}

function run(cmd, cmdArgs, options = {}) {
  console.log(`$ ${cmd} ${cmdArgs.join(' ')}`);
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${cmd} exited with ${result.status ?? result.signal}`);
  }
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function listFiles(dir, root = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) listFiles(full, root, out);
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function sizeOfDir(dir) {
  let total = 0;
  for (const rel of listFiles(dir)) total += statSync(path.join(dir, rel)).size;
  return total;
}

function pkgVersion(file, key) {
  return JSON.parse(readFileSync(file, 'utf8'))[key];
}

function cargoLockVersion(name) {
  const text = readFileSync(cargoLock, 'utf8');
  const block = text
    .split('[[package]]')
    .find(b => b.includes(`name = "${name}"`));
  return block ? /version = "([^"]+)"/.exec(block)?.[1] : undefined;
}

function libraryFiles(dir) {
  const libDir = path.join(dir, 'lib');
  if (!existsSync(libDir)) return [];
  return readdirSync(libDir)
    .filter(f => /\.(a|lib|so|dylib|dll)$|\.lib$/.test(f))
    .sort();
}

const configuration = 'Release';

// --- configure, build, install --------------------------------------------------
if (!args['skip-build']) {
  mkdirSync(buildDir, { recursive: true });
  const linkedDeps = path.join(buildDir, 'native-deps');
  if (!existsSync(linkedDeps) && existsSync(nativeDepsSource)) {
    symlinkSync(nativeDepsSource, linkedDeps, 'dir');
  }
  run('cmake', [
    '-S',
    cppDir,
    '-B',
    buildDir,
    `-DCMAKE_BUILD_TYPE=${configuration}`,
    // Cargo's cmake crate builds with -w (warnings suppressed); the prebuilt
    // matches it, since boost headers emit -Werror warnings under clang.
    '-DCMAKE_CXX_FLAGS=-w',
    '-DCMAKE_C_FLAGS=-w',
    // curl's docs/man-page install rules need generated pages the source build
    // never makes. The prebuilt installs curl's headers and library itself.
    '-DCURL_DISABLE_INSTALL=ON',
    `-DREACT_COMMON_DIR=${reactCommonDir}`,
    `-DREACT_CXX_PLATFORM_DIR=${reactCxxPlatformDir}`,
    `-DRN_GPUI_OVERRIDES_DIR=${overridesDir}`,
    `-DRN_GPUI_CXXBRIDGE_INCLUDE_DIR=${bridgeDir}`,
    `-DRN_GPUI_GENERATED_RNCORE_DIR=${rncoreDir}`,
  ]);
  run('cmake', [
    '--build',
    buildDir,
    '--target',
    'rn_gpui_core',
    '--parallel',
    jobs,
    '--config',
    configuration,
  ]);
}

rmSync(platformDir, { recursive: true, force: true });
mkdirSync(platformDir, { recursive: true });
run('cmake', [
  '--install',
  buildDir,
  '--config',
  configuration,
  '--prefix',
  platformDir,
]);

// --- manifest ------------------------------------------------------------------------
const inputs = inputHash();
const files = {};
for (const rel of listFiles(platformDir)) {
  if (rel === 'manifest.json') continue;
  files[rel] = sha256File(path.join(platformDir, rel));
}
const manifest = {
  formatVersion: 1,
  version,
  inputHash: inputs.hash,
  sourceCommit: spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout.trim(),
  reactNative: pkgVersion(reactNativePkg, 'version'),
  hermes: {
    package: pkgVersion(hermesPkg, 'version'),
  },
  triple: platform,
  cxxStdlib:
    process.platform === 'darwin'
      ? 'libc++'
      : process.platform === 'linux'
        ? 'libstdc++'
        : 'msvc',
  compiler:
    spawnSync(process.env.CXX ?? 'c++', ['--version'], {
      encoding: 'utf8',
    }).stdout.split('\n')[0] ?? '',
  cxxStandard: 20,
  msvcRuntime: process.platform === 'win32' ? '/MD' : null,
  cxxCrate: cargoLockVersion('cxx'),
  cxxBridgeHeaderSha256: sha256File(
    path.join(bridgeDir, 'rn-gpui-sys', 'src', 'lib.rs.h'),
  ),
  overridesSha256: createHash('sha256')
    .update(
      listFiles(overridesDir, overridesDir)
        .map(f => `${f}\0${sha256File(path.join(overridesDir, f))}`)
        .join('\n'),
    )
    .digest('hex'),
  defines: { HERMES_ENABLE_DEBUGGER: 1, REACT_NATIVE_DEBUG: 0 },
  minOs: process.platform === 'darwin' ? 'macos 11.0' : null,
  glibc: process.platform === 'linux' ? '2.36' : null,
  libraries: libraryFiles(platformDir),
  files,
  dependencyDirs: {
    boost: sizeOfDir(path.join(platformDir, 'include', 'third-party', 'boost')),
  },
};
writeFileSync(
  path.join(platformDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

// --- archive -------------------------------------------------------------------------------
const archivePath = path.join(outDir, archiveName);
rmSync(archivePath, { force: true });
run('tar', ['-czf', archivePath, '-C', outDir, platform]);
writeFileSync(
  `${archivePath}.sha256`,
  `${sha256File(archivePath)}  ${archiveName}\n`,
);

const seconds = Math.round((Date.now() - started) / 1000);
console.log(`archive ${archivePath} (${statSync(archivePath).size} bytes)`);
console.log(`installed tree ${platformDir} (${sizeOfDir(platformDir)} bytes)`);
console.log(`inputHash ${inputs.hash}`);
console.log(`build-prebuilt done in ${seconds}s`);
