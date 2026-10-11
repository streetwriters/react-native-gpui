import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Directories under `root` that contain a DLL. The CMake tree is multi-config
 * on Windows (Visual Studio), so the built JSI library sits in a per-config
 * subdirectory whose name depends on the Cargo profile. Collecting the
 * directories that really hold a DLL is more robust than naming the
 * configuration, and the loader ignores the ones that do not matter.
 */
function findDllDirectories(root) {
  const found = [];
  const walk = (directory, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some(entry => entry.isFile() && entry.name.endsWith('.dll'))) {
      found.push(directory);
    }
    for (const entry of entries) {
      if (entry.isDirectory())
        walk(path.join(directory, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const cargoManifest = path.join(
  repoRoot,
  'packages/react-native-gpui/ReactGpui/Cargo.toml',
);
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--manifest-path',
      cargoManifest,
      '--no-deps',
      '--format-version',
      '1',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  ),
);
const env = { ...process.env };

if (process.platform === 'darwin') {
  const targetTriple =
    process.env.CARGO_BUILD_TARGET ??
    execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
      /^host: (.+)$/mu,
    )?.[1];
  if (!targetTriple)
    throw new Error('Could not determine the Rust target triple');

  const hermesArch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  const runtimeDirs = [
    path.join(repoRoot, 'packages/react-native-gpui/bin', hermesArch),
    path.join(
      metadata.target_directory,
      'rn-gpui-cmake',
      targetTriple,
      'Debug/build/ReactCommon/jsi',
    ),
  ];
  env.DYLD_LIBRARY_PATH = [...runtimeDirs, env.DYLD_LIBRARY_PATH]
    .filter(Boolean)
    .join(path.delimiter);
} else if (process.platform === 'win32') {
  const targetTriple =
    process.env.CARGO_BUILD_TARGET ??
    execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
      /^host: (.+)$/mu,
    )?.[1];
  if (!targetTriple)
    throw new Error('Could not determine the Rust target triple');

  const hermesArch = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  // Windows has no loader search path variable: a DLL is found through PATH, or
  // next to the executable, and the test binaries live in `<target>/debug/deps`.
  // The engine ships in the package; the JSI DLL comes from the CMake tree,
  // whose configuration differs per Cargo profile (Debug, RelWithDebInfo), so
  // every directory that actually holds a DLL is found by walking the tree
  // instead of guessing the configuration name.
  const runtimeDirs = [
    path.join(repoRoot, 'packages/@react-native-gpui/hermes/bin', hermesArch),
    ...findDllDirectories(
      path.join(metadata.target_directory, 'rn-gpui-cmake', targetTriple),
    ),
  ];
  env.PATH = [...runtimeDirs, env.PATH].filter(Boolean).join(path.delimiter);
} else if (process.platform === 'linux') {
  const targetTriple =
    process.env.CARGO_BUILD_TARGET ??
    execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(
      /^host: (.+)$/mu,
    )?.[1];
  if (!targetTriple)
    throw new Error('Could not determine the Rust target triple');

  const hermesArch = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  // The sys test binaries link the shared JSI library and the engine.
  const runtimeDirs = [
    path.join(repoRoot, 'packages/@react-native-gpui/hermes/bin', hermesArch),
    path.join(
      metadata.target_directory,
      'rn-gpui-cmake',
      targetTriple,
      'Debug/build/ReactCommon/jsi',
    ),
  ];
  env.LD_LIBRARY_PATH = [...runtimeDirs, env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(path.delimiter);
}

const result = spawnSync(
  'cargo',
  [
    'test',
    '--manifest-path',
    cargoManifest,
    '--workspace',
    '--features',
    'react-native-gpui/test-driver',
  ],
  { cwd: repoRoot, env, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
