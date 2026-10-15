#!/usr/bin/env node
// Packs every publishable package into ci-out/tarballs/ and prints a JSON map
// of package name -> tarball path on stdout, which is what clean-install.mjs
// reads. Diagnostics go to stderr so stdout stays parseable.
//
// Usage:
//   node scripts/ci/pack-all.mjs [--out <dir>]
//
// A package is publishable when its package.json has no `"private": true`.
// Packages already packed into the output directory are removed first, so a
// rerun does not mix tarballs from two different commits.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/// Every `<dir>/<name>/package.json` one level below the repository root, in
/// the two directories that hold packages. Deliberately not a recursive glob:
/// a package nested inside another package is not published on its own.
function packageManifests() {
  const manifests = [];
  for (const group of ['packages', 'modules']) {
    const groupDir = path.join(repoRoot, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir).sort()) {
      const manifest = path.join(groupDir, entry, 'package.json');
      if (fs.existsSync(manifest)) manifests.push(manifest);
    }
  }
  return manifests;
}

function parseArgs(argv) {
  const parsed = { out: path.join(repoRoot, 'ci-out', 'tarballs') };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--out') parsed.out = path.resolve(argv[++index]);
  }
  return parsed;
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const packed = {};
  for (const manifest of packageManifests()) {
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (pkg.private === true) continue;
    const dir = path.dirname(manifest);
    // `npm pack --json` prints an array with the file name it wrote.
    const output = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', out],
      {
        cwd: dir,
        encoding: 'utf8',
        // npm's own notices go to stderr; keep them out of the JSON parse.
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const [entry] = JSON.parse(output);
    if (!entry?.filename) {
      throw new Error(`npm pack produced no file name for ${pkg.name}`);
    }
    packed[pkg.name] = path.join(out, entry.filename);
    process.stderr.write(`packed ${pkg.name} -> ${entry.filename}\n`);
  }

  if (Object.keys(packed).length === 0) {
    throw new Error('no publishable packages found');
  }
  process.stdout.write(`${JSON.stringify(packed, null, 2)}\n`);
}

main();
