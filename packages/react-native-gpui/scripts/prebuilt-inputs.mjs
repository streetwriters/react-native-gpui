#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageDir, '..', '..');

const TREE_INPUTS = [
  'packages/react-native-gpui/ReactGpui/rn-gpui-sys/cpp',
  'packages/react-native-gpui/ReactCxxPlatform',
  'packages/react-native-gpui/ReactCommonOverrides',
];
const FILE_INPUTS = [
  'packages/react-native-gpui/ReactGpui/Cargo.lock',
  'packages/react-native-gpui/scripts/build-prebuilt.mjs',
  'packages/react-native-gpui/scripts/prebuilt-inputs.mjs',
  'node_modules/react-native/package.json',
];

const SKIP_DIRS = new Set(['build', 'node_modules', '.git', 'native-deps']);

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) out.push(full);
  }
  return out;
}

export function collectInputs() {
  const files = [];
  for (const rel of TREE_INPUTS) {
    const dir = path.join(repoRoot, rel);
    if (existsSync(dir)) walk(dir, files);
  }
  for (const rel of FILE_INPUTS) {
    const full = path.join(repoRoot, rel);
    if (existsSync(full)) files.push(full);
  }
  return files
    .map(f => path.relative(repoRoot, f).split(path.sep).join('/'))
    .sort();
}

// Hash with CRLF folded to LF so a Windows checkout with core.autocrlf
// produces the same hashes as macOS and Linux.
function contentSha256(file) {
  const text = readFileSync(file).toString('latin1').replace(/\r\n/gu, '\n');
  return createHash('sha256').update(text, 'latin1').digest('hex');
}

export function inputHash() {
  const hash = createHash('sha256');
  const perFile = [];
  for (const rel of collectInputs()) {
    const digest = contentSha256(path.join(repoRoot, rel));
    perFile.push({ path: rel, sha256: digest });
    hash.update(`${rel}\0${digest}\n`);
  }
  return { hash: hash.digest('hex'), files: perFile };
}

// Run as a CLI only when this file is the entry point. The guard matters
// because importers (build-prebuilt.mjs, build.rs via node -e) must not print.
const isEntry =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntry) {
  if (process.argv.includes('--overrides-sha256')) {
    console.log(overridesSha256());
    process.exit(0);
  }
  const { hash, files } = inputHash();
  if (process.argv.includes('--list')) {
    for (const f of files) console.log(`${f.sha256}  ${f.path}`);
    console.log(`${hash}  <inputHash>`);
  } else {
    console.log(hash);
  }
}

// sha256 over the sorted "file\0sha256" lines of ReactCommonOverrides, joined
// by "\n". build-prebuilt.mjs writes this into the manifest; the CMake prebuilt
// branch receives it from build.rs and compares.
export function overridesSha256() {
  const dir = path.join(
    repoRoot,
    'packages/react-native-gpui/ReactCommonOverrides',
  );
  const files = [];
  walk(dir, files);
  const lines = files
    .map(f => path.relative(dir, f).split(path.sep).join('/'))
    .sort()
    .map(rel => {
      const digest = contentSha256(path.join(dir, rel));
      return `${rel}\0${digest}`;
    });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
