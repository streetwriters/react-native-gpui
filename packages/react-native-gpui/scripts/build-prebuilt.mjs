#!/usr/bin/env node
// Builds the prebuilt C++ runtime for this host and packs it as
// prebuilt-binaries-<platform>.tar.gz with a manifest.json.
//
// Usage:
//   node scripts/build-prebuilt.mjs --version <v> --out <dir> \
//     [--bridge <cxxbridge-include> --rncore <generated-rncore-dir>] \
//     [--build-dir <dir>] [--native-deps <dir>] [--skip-build] [--jobs <n>]
//
// --bridge and --rncore are optional. When omitted, the cxxbridge headers and
// FBReactNativeSpec sources are generated (scripts/generate-prebuilt-inputs.mjs),
// so no tester build is needed. When given, they must be the Cargo OUT_DIR
// outputs of `cargo build -p rn-gpui-sys` (out/cxxbridge-include and
// out/fbreactnativespec). --native-deps reuses downloaded native dependencies
// between runs.
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
import { inputHash, overridesSha256 } from './prebuilt-inputs.mjs';

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

const args = parseArgs(process.argv.slice(2));
const version = args.version;
const outDir = path.resolve(args.out ?? fail('--out is required'));
// Without --bridge/--rncore the generated inputs are produced into the build
// dir (scripts/generate-prebuilt-inputs.mjs), so no tester build is needed.
const generatedDir = path.resolve(
  args['build-dir'] ?? path.join(os.tmpdir(), 'rn-gpui-prebuilt-build'),
  '..',
  'generated-inputs',
);
let bridgeDir = args.bridge ? path.resolve(args.bridge) : null;
let rncoreDir = args.rncore ? path.resolve(args.rncore) : null;
const buildDir = path.resolve(
  args['build-dir'] ?? path.join(os.tmpdir(), 'rn-gpui-prebuilt-build'),
);
// Source of the native-deps cache (OpenSSL, curl, folly sources). A fresh build
// dir cannot build OpenSSL apps/ on macOS, so the cache is linked in.
const nativeDepsSource = args['native-deps']
  ? path.resolve(args['native-deps'])
  : null;
const jobs =
  args.jobs ?? String(os.availableParallelism?.() ?? os.cpus().length);
if (!version) fail('--version is required');

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

// Release with light debug info so stacks symbolize without the ~1.8 GB of
// full debug libs. The consumer (build.rs) must match the runtime ABI:
//   - MSVC: /MD (MultiThreadedDLL) and _ITERATOR_DEBUG_LEVEL=0; PDBs ship
//     separately (prebuilt-binaries-win32-x64-pdb.tar.gz).
//   - clang/gcc: NDEBUG from Release, line tables only.
// These are recorded in the manifest `flags` field.
function buildFlags() {
  const isMsvc = process.platform === 'win32';
  const isGcc = !isMsvc && process.platform === 'linux';
  const debugCxx = isMsvc ? '/Zi' : isGcc ? '-g1' : '-gline-tables-only';
  const common = ['-w'];
  return {
    cxx: [...common, debugCxx],
    c: [...common, debugCxx],
    msvcRuntimeLibrary: isMsvc ? 'MultiThreadedDLL' : null,
    msvcIteratorDebugLevel: isMsvc ? '0' : null,
    debugInfo: isMsvc ? 'pdb-separate' : 'embedded-line-tables',
  };
}
const flags = buildFlags();
// MSVC needs the iterator-debug level as a compile definition; other toolchains
// get only the warning and debug flags.
const cxxFlags = [
  ...flags.cxx,
  ...(flags.msvcIteratorDebugLevel !== null
    ? [`/D_ITERATOR_DEBUG_LEVEL=${flags.msvcIteratorDebugLevel}`]
    : []),
].join(' ');
const cFlags = [
  ...flags.c,
  ...(flags.msvcIteratorDebugLevel !== null
    ? [`/D_ITERATOR_DEBUG_LEVEL=${flags.msvcIteratorDebugLevel}`]
    : []),
].join(' ');

// --- generated inputs ---------------------------------------------------------------
// The cxxbridge headers and FBReactNativeSpec are normally produced by build.rs
// inside a cargo build. Produce them here with the same tools when not given.
if (!bridgeDir || !rncoreDir) {
  const generated = spawnSync(
    process.execPath,
    [path.join(scriptDir, 'generate-prebuilt-inputs.mjs'), generatedDir],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  if (generated.status !== 0)
    fail('generating cxxbridge/FBReactNativeSpec failed');
  const [bridgeOut, rncoreOut] = generated.stdout.trim().split('\n');
  bridgeDir ??= bridgeOut;
  rncoreDir ??= rncoreOut;
}
if (!existsSync(path.join(bridgeDir, 'rust', 'cxx.h')))
  fail(`missing ${path.join(bridgeDir, 'rust', 'cxx.h')}`);
if (!existsSync(path.join(rncoreDir, 'jni')))
  fail(`missing ${path.join(rncoreDir, 'jni')}`);

// --- configure, build, install --------------------------------------------------
if (!args['skip-build']) {
  mkdirSync(buildDir, { recursive: true });
  const linkedDeps = path.join(buildDir, 'native-deps');
  if (
    nativeDepsSource &&
    !existsSync(linkedDeps) &&
    existsSync(nativeDepsSource)
  ) {
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
    `-DCMAKE_CXX_FLAGS=${cxxFlags}`,
    `-DCMAKE_C_FLAGS=${cFlags}`,
    ...(flags.msvcRuntimeLibrary
      ? [
          `-DCMAKE_MSVC_RUNTIME_LIBRARY=${flags.msvcRuntimeLibrary}`,
          '-DCMAKE_POLICY_DEFAULT_CMP0091=NEW',
        ]
      : []),
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
  overridesSha256: overridesSha256(),
  defines: { HERMES_ENABLE_DEBUGGER: 1, REACT_NATIVE_DEBUG: 0 },
  flags,
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
