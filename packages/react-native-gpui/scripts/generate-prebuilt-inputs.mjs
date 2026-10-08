#!/usr/bin/env node
// Generates the two C++ inputs of the prebuilt runtime that otherwise come from
// a Cargo build of rn-gpui-sys: the cxx bridge headers and FBReactNativeSpec.
// Both use the same tools as build.rs so the prebuilt matches a source build.
//
// Usage: node scripts/generate-prebuilt-inputs.mjs <out-dir>
//   <out-dir>/cxxbridge-include/rust/cxx.h
//   <out-dir>/cxxbridge-include/rn-gpui-sys/src/lib.rs.h
//   <out-dir>/fbreactnativespec/   (stdout: nothing; diagnostics on stderr)
//
// The cxxbridge CLI is cxxbridge-cmd at the exact version locked in
// ReactGpui/Cargo.lock (cxx 1.0.202). It is installed into a scratch dir with
// `cargo install --locked`, so no tester or workspace build is needed.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const reactNativeDir = path.join(repoRoot, 'node_modules', 'react-native');
const rnGpuiSysDir = path.join(packageDir, 'ReactGpui', 'rn-gpui-sys');
const fbSpecCodegen = path.join(
  rnGpuiSysDir,
  'scripts',
  'generate-fbreactnativespec.cjs',
);

// Keep this in sync with the cxx entry in ReactGpui/Cargo.lock.
const CXX_VERSION = '1.0.202';

function fail(message) {
  console.error(`generate-prebuilt-inputs: ${message}`);
  process.exit(2);
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    fail(
      `${cmd} ${args.join(' ')} exited with ${result.status ?? result.signal}`,
    );
  }
  return result.stdout;
}

function lockedCxxVersion() {
  const lock = readFileSync(
    path.join(packageDir, 'ReactGpui', 'Cargo.lock'),
    'utf8',
  );
  const match = lock.match(/name = "cxx"\nversion = "([^"]+)"/u);
  if (!match) fail('cxx is not in ReactGpui/Cargo.lock');
  if (match[1] !== CXX_VERSION) {
    fail(`Cargo.lock pins cxx ${match[1]}; update CXX_VERSION to match`);
  }
  return match[1];
}

// Install cxxbridge-cmd once into a cache dir beside the build; reused after.
function ensureCxxbridge(toolRoot) {
  const bin = path.join(
    toolRoot,
    'bin',
    process.platform === 'win32' ? 'cxxbridge.exe' : 'cxxbridge',
  );
  if (existsSync(bin)) return bin;
  mkdirSync(toolRoot, { recursive: true });
  console.error(
    `generate-prebuilt-inputs: installing cxxbridge-cmd ${CXX_VERSION}`,
  );
  run(
    'cargo',
    [
      'install',
      '--locked',
      '--version',
      CXX_VERSION,
      'cxxbridge-cmd',
      '--root',
      toolRoot,
    ],
    { stdio: 'inherit' },
  );
  if (!existsSync(bin)) fail(`cargo install did not produce ${bin}`);
  return bin;
}

const outDir = path.resolve(process.argv[2] ?? fail('usage: <out-dir>'));
lockedCxxVersion();

const toolRoot = path.join(os.tmpdir(), `rn-gpui-cxxbridge-${CXX_VERSION}`);
const cxxbridge = ensureCxxbridge(toolRoot);

// 1. cxxbridge headers, as cxx_build emits them for src/lib.rs.
const bridgeInclude = path.join(outDir, 'cxxbridge-include');
rmSync(bridgeInclude, { recursive: true, force: true });
mkdirSync(path.join(bridgeInclude, 'rust'), { recursive: true });
mkdirSync(path.join(bridgeInclude, 'rn-gpui-sys', 'src'), { recursive: true });
const cxxH = run(cxxbridge, ['--header']);
writeFile(path.join(bridgeInclude, 'rust', 'cxx.h'), cxxH);
const libRsH = run(cxxbridge, [
  path.join(rnGpuiSysDir, 'src', 'lib.rs'),
  '--header',
]);
writeFile(path.join(bridgeInclude, 'rn-gpui-sys', 'src', 'lib.rs.h'), libRsH);

// 2. FBReactNativeSpec, generated with the same script build.rs runs.
const rncoreDir = path.join(outDir, 'fbreactnativespec');
rmSync(rncoreDir, { recursive: true, force: true });
run(process.execPath, [fbSpecCodegen, reactNativeDir, rncoreDir], {
  stdio: 'inherit',
});
if (!existsSync(path.join(rncoreDir, 'jni'))) {
  fail(`codegen produced no jni/ under ${rncoreDir}`);
}

console.error(`generate-prebuilt-inputs: bridge ${bridgeInclude}`);
console.error(`generate-prebuilt-inputs: rncore ${rncoreDir}`);
process.stdout.write(`${bridgeInclude}\n${rncoreDir}\n`);

function writeFile(file, content) {
  writeFileSync(file, content);
}
