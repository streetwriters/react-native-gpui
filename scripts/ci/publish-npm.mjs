#!/usr/bin/env node
// Publishes the @react-native-gpui packages in dependency order.
//
//   node scripts/ci/publish-npm.mjs [--dry-run] [--check-only]
//
// The packages are versioned `0.<react-native minor>.<patch>[-alpha.N]`, and
// the internal dependencies between them carry the same version. --check-only
// runs the version rules without publishing anything.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/** The publishable workspace packages: public, with a publishConfig. */
export function publishablePackages(root = repoRoot) {
  const workspaces = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).workspaces;
  const found = [];
  for (const workspace of workspaces) {
    const dir = path.join(root, workspace);
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.private || !manifest.publishConfig) continue;
    found.push({ dir, manifest });
  }
  return found;
}

/** Packages ordered so that every package follows the ones it depends on. */
export function dependencyOrder(packages) {
  const byName = new Map(packages.map(entry => [entry.manifest.name, entry]));
  const ordered = [];
  const visiting = new Set();
  const visit = entry => {
    const name = entry.manifest.name;
    if (ordered.includes(entry)) return;
    if (visiting.has(name)) throw new Error(`dependency cycle through ${name}`);
    visiting.add(name);
    const wanted = {
      ...entry.manifest.devDependencies,
      ...entry.manifest.peerDependencies,
      ...entry.manifest.dependencies,
    };
    for (const dependency of Object.keys(wanted).sort()) {
      const target = byName.get(dependency);
      if (target) visit(target);
    }
    visiting.delete(name);
    ordered.push(entry);
  };
  // Names sorted so the order is stable between runs.
  for (const name of [...byName.keys()].sort()) visit(byName.get(name));
  return ordered;
}

/**
 * The problems with the packages' versions, as readable lines.
 *
 * Every version is `0.<minor>.<patch>[-alpha.N]` for the React Native minor in
 * the peer dependency, and internal dependencies are exactly the package's own
 * version.
 */
export function versionProblems(packages) {
  const problems = [];
  const names = new Set(packages.map(entry => entry.manifest.name));
  const shape = /^0\.(\d+)\.\d+(?:-alpha\.\d+)?$/u;
  for (const { manifest } of packages) {
    const match = shape.exec(manifest.version);
    if (match === null) {
      problems.push(
        `${manifest.name}: version ${manifest.version} is not 0.<react-native minor>.<patch>[-alpha.N]`,
      );
      continue;
    }
    const peer = manifest.peerDependencies?.['react-native'];
    if (peer !== undefined) {
      const peerMinor = /^0\.(\d+)\.x$/u.exec(peer)?.[1];
      if (peerMinor === undefined) {
        problems.push(
          `${manifest.name}: peer react-native ${peer} is not 0.<minor>.x`,
        );
      } else if (peerMinor !== match[1]) {
        problems.push(
          `${manifest.name}: version ${manifest.version} does not match peer react-native ${peer}`,
        );
      }
    }
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (names.has(name) && range !== manifest.version) {
          problems.push(
            `${manifest.name}: ${field}.${name} is ${range}, expected ${manifest.version}`,
          );
        }
      }
    }
  }
  const versions = new Set(packages.map(entry => entry.manifest.version));
  if (versions.size > 1) {
    problems.push(
      `the packages do not share one version: ${[...versions].join(', ')}`,
    );
  }
  return problems;
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const packages = dependencyOrder(publishablePackages());
  const problems = versionProblems(packages);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `versions ok: ${packages.map(entry => entry.manifest.name).join(', ')}`,
  );
  if (argv.includes('--check-only')) return;
  for (const { dir, manifest } of packages) {
    const args = [
      'publish',
      '--provenance',
      '--tag',
      'alpha',
      '--access',
      'public',
    ];
    if (dryRun) args.push('--dry-run');
    console.log(
      `npm ${args.join(' ')}  # ${manifest.name}@${manifest.version}`,
    );
    const result = spawnSync('npm', args, { cwd: dir, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
