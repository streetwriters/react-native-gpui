#!/usr/bin/env node
// Publishes the @react-native-gpui packages in dependency order.
//
//   node scripts/ci/publish-npm.mjs [--dry-run] [--check-only]
//
// cli, codegen, core, hermes and testing are versioned
// `0.<react-native minor>.<patch>[-alpha.N]`; a module takes the version of the
// library it adapts, or `0.0.<patch>` when it is standalone. Dependencies between
// our packages are exact. --check-only
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

/** The packages that follow React Native: everything outside `modules/`. */
const FOLLOWS_REACT_NATIVE = new Set([
  '@react-native-gpui/cli',
  '@react-native-gpui/codegen',
  '@react-native-gpui/core',
  '@react-native-gpui/hermes',
  '@react-native-gpui/testing',
]);

/** The upstream package a module adapts, named `react-native-<module>`. */
function upstreamPeer(manifest) {
  const short = manifest.name.split('/').pop();
  const name = `react-native-${short}`;
  const range = manifest.peerDependencies?.[name];
  return range === undefined ? undefined : { name, range };
}

/**
 * The problems with the packages' versions, as readable lines.
 *
 * - cli, codegen, core, hermes and testing are `0.<minor>.<patch>[-alpha.N]` for
 *   the React Native minor in their peer dependency.
 * - A module that adapts a library (it has a `react-native-<module>` peer) takes
 *   that library's `<major>.<minor>`.
 * - Any other module is standalone and is `0.0.<patch>[-alpha.N]`.
 * - A dependency on another of our packages is exactly that package's version.
 */
export function versionProblems(packages) {
  const problems = [];
  const versions = new Map(
    packages.map(entry => [entry.manifest.name, entry.manifest.version]),
  );
  const tail = '(?:-alpha\\.\\d+)?';
  for (const { manifest } of packages) {
    const { name, version } = manifest;
    if (FOLLOWS_REACT_NATIVE.has(name)) {
      const match = new RegExp(`^0\\.(\\d+)\\.\\d+${tail}$`, 'u').exec(version);
      if (match === null) {
        problems.push(
          `${name}: version ${version} is not 0.<react-native minor>.<patch>[-alpha.N]`,
        );
      } else {
        const peer = manifest.peerDependencies?.['react-native'];
        if (peer !== undefined) {
          const peerMinor = /^0\.(\d+)\.x$/u.exec(peer)?.[1];
          if (peerMinor === undefined) {
            problems.push(
              `${name}: peer react-native ${peer} is not 0.<minor>.x`,
            );
          } else if (peerMinor !== match[1]) {
            problems.push(
              `${name}: version ${version} does not match peer react-native ${peer}`,
            );
          }
        }
      }
    } else {
      const upstream = upstreamPeer(manifest);
      if (upstream !== undefined) {
        const peer = /^(\d+)\.(\d+)\.x$/u.exec(upstream.range);
        const match = new RegExp(`^(\\d+)\\.(\\d+)\\.\\d+${tail}$`, 'u').exec(
          version,
        );
        if (peer === null) {
          problems.push(
            `${name}: peer ${upstream.name} ${upstream.range} is not <major>.<minor>.x`,
          );
        } else if (
          match === null ||
          match[1] !== peer[1] ||
          match[2] !== peer[2]
        ) {
          problems.push(
            `${name}: version ${version} does not match peer ${upstream.name} ${upstream.range}`,
          );
        }
      } else if (!new RegExp(`^0\\.0\\.\\d+${tail}$`, 'u').test(version)) {
        problems.push(
          `${name}: standalone module version ${version} is not 0.0.<patch>[-alpha.N]`,
        );
      }
    }
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ]) {
      for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
        const own = versions.get(dependency);
        if (own !== undefined && range !== own) {
          problems.push(
            `${name}: ${field}.${dependency} is ${range}, expected ${own}`,
          );
        }
      }
    }
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
