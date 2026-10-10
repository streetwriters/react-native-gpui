import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
