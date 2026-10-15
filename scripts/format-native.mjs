#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const args = process.argv.slice(2);
const check = args.includes('--check');
const requested = args.filter(arg => arg !== '--check');

const cFamily = /\.(c|cc|cpp|h|hpp|m|mm)$/;
const rust = /\.rs$/;
const excluded = [
  'packages/@react-native-gpui/core/ReactCxxPlatform/',
  'packages/@react-native-gpui/core/ReactCommonOverrides/',
  'packages/@react-native-gpui/core/ReactGpui/rn-gpui-sys/cpp/third_party/',
  // Vendored facebook/hermes sources, kept byte-identical to the pinned commit
  // (the hermes-engine workflow diffs them against upstream).
  'packages/@react-native-gpui/hermes/API/',
  'packages/@react-native-gpui/hermes/include/',
  'packages/@react-native-gpui/hermes/public/',
  'packages/rn-gpui-tester/ios/',
  'packages/rn-gpui-tester/android/',
];

const toRelative = file =>
  path.relative(repoRoot, path.resolve(file)).split(path.sep).join('/');
const files = (
  requested.length > 0
    ? requested.map(toRelative)
    : execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
        },
      ).split('\n')
).filter(
  file =>
    file &&
    existsSync(path.resolve(repoRoot, file)) &&
    !excluded.some(prefix => file.startsWith(prefix)),
);

function run(tool, toolArgs, targets, installHint) {
  if (targets.length === 0) return true;
  const result = spawnSync(tool, [...toolArgs, ...targets], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error?.code === 'ENOENT') {
    console.error(`${tool} was not found on PATH. ${installHint}`);
    return false;
  }
  return result.status === 0;
}

const cTargets = files.filter(file => cFamily.test(file));
const rustTargets = files.filter(file => rust.test(file));

const cOk = run(
  'clang-format',
  check ? ['--dry-run', '-Werror'] : ['-i'],
  cTargets,
  'Install it with `brew install clang-format` or your platform package manager.',
);
const rustOk = run(
  'rustfmt',
  check ? ['--check', '--edition', '2021'] : ['--edition', '2021'],
  rustTargets,
  'Install it with `rustup component add rustfmt`.',
);

if (!cOk || !rustOk) {
  if (check)
    console.error('Native sources are not formatted. Run `npm run format`.');
  process.exit(1);
}
