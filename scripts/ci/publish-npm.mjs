#!/usr/bin/env node
// Checks everything a release depends on, then publishes the @react-native-gpui
// packages to npm and creates a GitHub release for each.
//
//   node scripts/ci/publish-npm.mjs [--check-only | --dry-run] [--local]
//
// --check-only runs the checks; --dry-run also packs and runs `npm publish
// --dry-run`. --local publishes from a developer machine, without npm
// provenance, which only CI can sign. Modules are published before packages,
// each group in dependency order. A rerun skips what is already on npm and
// already released.
//
// cli, codegen, core, hermes and testing are versioned
// `0.<react-native minor>.<patch>[-alpha.N]`; a module takes the version of the
// library it adapts, or `0.0.<patch>` when it is standalone. Dependencies between
// our packages are exact.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
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

const REPOSITORY = 'streetwriters/react-native-gpui';
const DOCS = 'https://streetwriters.github.io/react-native-gpui/';

/** Modules first, then packages, each group in dependency order. */
export function publishOrder(packages) {
  const isModule = entry =>
    path.relative(repoRoot, entry.dir).split(path.sep)[0] === 'modules';
  return [
    ...dependencyOrder(packages.filter(isModule)),
    ...dependencyOrder(packages.filter(entry => !isModule(entry))),
  ];
}

/** The fields npm and the registry page need, as readable lines. */
export function metadataProblems(packages) {
  const problems = [];
  for (const { manifest } of packages) {
    const { name } = manifest;
    if (!manifest.description) problems.push(`${name}: no description`);
    if (!manifest.license) problems.push(`${name}: no license`);
    if (!manifest.repository?.url) problems.push(`${name}: no repository`);
    if (manifest.publishConfig?.access !== 'public') {
      problems.push(`${name}: publishConfig.access is not public`);
    }
    if (manifest.publishConfig?.tag !== 'latest') {
      problems.push(`${name}: publishConfig.tag is not latest`);
    }
  }
  return problems;
}

/**
 * The problems with one package's tarball, given the paths `npm pack` would
 * include: a license, no tests, and the native project its
 * react-native.config.js points autolinking at.
 */
export function tarballProblems(manifest, files, desktop) {
  const name = manifest.name;
  const problems = [];
  if (!files.some(file => /^LICEN[SC]E/iu.test(file))) {
    problems.push(`${name}: the tarball has no LICENSE`);
  }
  if (!files.includes('CHANGELOG.md')) {
    problems.push(`${name}: the tarball has no CHANGELOG.md`);
  }
  for (const file of files) {
    if (/\.test\.[cm]?[jt]sx?$/u.test(file)) {
      problems.push(`${name}: the tarball includes the test ${file}`);
    }
  }
  if (desktop?.cmake && !files.includes(`${desktop.cmake}/CMakeLists.txt`)) {
    problems.push(
      `${name}: the tarball has no ${desktop.cmake}/CMakeLists.txt for autolinking`,
    );
  }
  if (desktop?.crate && !files.some(file => /(^|\/)Cargo\.toml$/u.test(file))) {
    problems.push(
      `${name}: the tarball has no Cargo.toml for ${desktop.crate}`,
    );
  }
  return problems;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    // npm is a .cmd script on Windows; gh is a real executable.
    shell: process.platform === 'win32' && command === 'npm',
    ...options,
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function ghJson(args) {
  const result = run('gh', args);
  return result.ok ? JSON.parse(result.stdout) : null;
}

function gitProblems() {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return process.env.GITHUB_REF === 'refs/heads/main'
      ? []
      : [`git: the workflow runs on ${process.env.GITHUB_REF}, not main`];
  }
  const problems = [];
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
  if (branch !== 'main') problems.push(`git: on ${branch}, not main`);
  if (run('git', ['status', '--porcelain']).stdout !== '') {
    problems.push('git: the working tree has uncommitted changes');
  }
  run('git', ['fetch', '--quiet', 'origin', 'main']);
  const head = run('git', ['rev-parse', 'HEAD']).stdout;
  const remote = run('git', ['rev-parse', 'origin/main']).stdout;
  if (head !== remote) problems.push('git: HEAD is not origin/main');
  return problems;
}

function ciProblems(sha) {
  const runs = ghJson([
    'run',
    'list',
    '--repo',
    REPOSITORY,
    '--workflow',
    'ci.yml',
    '--commit',
    sha,
    '--json',
    'status,conclusion,databaseId',
  ]);
  if (runs === null)
    return ['ci: could not list the CI runs (is gh logged in?)'];
  const done = runs.filter(entry => entry.status === 'completed');
  if (done.length === 0)
    return [`ci: no finished CI run on ${sha.slice(0, 7)}`];
  return done[0].conclusion === 'success'
    ? []
    : [
        `ci: the latest CI run on ${sha.slice(0, 7)} is ${done[0].conclusion} (${done[0].databaseId})`,
      ];
}

function hermesProblems() {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'packages/hermes/package.json'),
      'utf8',
    ),
  );
  const tag = `@react-native-gpui/hermes@${manifest.hermes.engineRelease}`;
  const release = ghJson([
    'release',
    'view',
    tag,
    '--repo',
    REPOSITORY,
    '--json',
    'assets',
  ]);
  if (release === null)
    return [`hermes: the engine release ${tag} does not exist`];
  const zips = release.assets.filter(asset =>
    /^hermes-.*\.zip$/u.test(asset.name),
  );
  return zips.length === 6
    ? []
    : [`hermes: ${tag} has ${zips.length} engine zips, expected 6`];
}

function prebuiltProblems() {
  const pin = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'packages/core/prebuilt-binaries.json'),
      'utf8',
    ),
  );
  const problems = [];
  const release = ghJson([
    'release',
    'view',
    pin.tag,
    '--repo',
    REPOSITORY,
    '--json',
    'assets',
  ]);
  if (release === null)
    return [`prebuilt: the release ${pin.tag} does not exist`];
  const sums = run('gh', [
    'release',
    'download',
    pin.tag,
    '--repo',
    REPOSITORY,
    '--pattern',
    'SHA256SUMS.txt',
    '--output',
    '-',
  ]);
  const checksums = new Map(
    sums.stdout
      .split('\n')
      .map(line => line.trim().split(/\s+/u))
      .filter(parts => parts.length === 2)
      .map(([sum, file]) => [file, sum]),
  );
  for (const [platform, asset] of Object.entries(pin.assets)) {
    const published = release.assets.find(entry => entry.name === asset.file);
    if (published === undefined) {
      problems.push(`prebuilt: ${pin.tag} has no ${asset.file} (${platform})`);
    } else if (published.size !== asset.size) {
      problems.push(
        `prebuilt: ${asset.file} is ${published.size} bytes, the pin says ${asset.size}`,
      );
    }
    if (checksums.get(asset.file) !== asset.sha256) {
      problems.push(
        `prebuilt: the checksum of ${asset.file} does not match the pin`,
      );
    }
  }
  const check = run('node', ['packages/core/scripts/check-prebuilt-pin.mjs']);
  if (!check.ok) problems.push(`prebuilt: ${check.stderr || check.stdout}`);
  return problems;
}

function packFiles(dir) {
  const result = run(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: dir },
  );
  if (!result.ok)
    throw new Error(`npm pack failed in ${dir}: ${result.stderr}`);
  return JSON.parse(result.stdout)[0].files.map(file => file.path);
}

function desktopConfig(dir) {
  const file = path.join(dir, 'react-native.config.js');
  if (!fs.existsSync(file)) return undefined;
  return createRequire(file)(file).dependency?.platforms?.desktop;
}

function onNpm({ name, version }) {
  return (
    run('npm', ['view', `${name}@${version}`, 'version']).stdout === version
  );
}

function releaseTag({ name, version }) {
  return `${name}@${version}`;
}

function released(manifest) {
  return run('gh', [
    'release',
    'view',
    releaseTag(manifest),
    '--repo',
    REPOSITORY,
  ]).ok;
}

/**
 * The body of a version's section in a CHANGELOG.md: the lines after its
 * `## <version>` heading, up to the next `## ` heading. Undefined when the
 * version has no section or the section is empty.
 */
export function changelogSection(text, version) {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  const heading = new RegExp(
    `^## \\[?${version.replace(/[.+]/gu, '\\$&')}\\]?(\\s|$)`,
    'u',
  );
  const start = lines.findIndex(line => heading.test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? undefined : body;
}

function readChangelog(dir) {
  const file = path.join(dir, 'CHANGELOG.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

/** Every package needs a CHANGELOG.md with a section for its version. */
export function changelogProblems(packages, read = readChangelog) {
  const problems = [];
  for (const { dir, manifest } of packages) {
    const text = read(dir);
    if (text === undefined) {
      problems.push(`${manifest.name}: no CHANGELOG.md`);
    } else if (changelogSection(text, manifest.version) === undefined) {
      problems.push(
        `${manifest.name}: CHANGELOG.md has no entries for ${manifest.version}`,
      );
    }
  }
  return problems;
}

/** A release's notes: its changelog section, then how to install it. */
export function releaseNotes({ name, version }, changelog) {
  return [
    changelogSection(changelog, version),
    '',
    '```sh',
    `npm install ${name}@${version}`,
    '```',
    '',
    `npm: https://www.npmjs.com/package/${name}/v/${version}`,
    `Documentation: ${DOCS}`,
  ].join('\n');
}

function main(argv) {
  const checkOnly = argv.includes('--check-only');
  const dryRun = argv.includes('--dry-run');
  const local = argv.includes('--local');
  const packages = publishOrder(publishablePackages());
  const sha = run('git', ['rev-parse', 'HEAD']).stdout;

  const problems = [
    ...gitProblems(),
    ...ciProblems(sha),
    ...hermesProblems(),
    ...prebuiltProblems(),
    ...versionProblems(packages),
    ...metadataProblems(packages),
    ...changelogProblems(packages),
  ];
  for (const { dir, manifest } of packages) {
    problems.push(
      ...tarballProblems(manifest, packFiles(dir), desktopConfig(dir)),
    );
  }
  if (!checkOnly && !dryRun) {
    if (!run('npm', ['whoami']).ok)
      problems.push('npm: not logged in (npm login)');
    if (!run('gh', ['auth', 'status']).ok)
      problems.push('gh: not logged in (gh auth login)');
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  console.log('checks passed. Order:');
  const pending = packages.map(entry => ({
    ...entry,
    published: onNpm(entry.manifest),
    released: released(entry.manifest),
  }));
  for (const { manifest, published, released: hasRelease } of pending) {
    const state = [published && 'on npm', hasRelease && 'released'].filter(
      Boolean,
    );
    console.log(
      `  ${manifest.name}@${manifest.version}${state.length ? ` (${state.join(', ')})` : ''}`,
    );
  }
  if (checkOnly) return;

  for (const { dir, manifest, published, released: hasRelease } of pending) {
    if (!published) {
      const args = ['publish', '--access', 'public', '--tag', 'latest'];
      if (!local) args.push('--provenance');
      if (dryRun) args.push('--dry-run');
      console.log(
        `npm ${args.join(' ')}  # ${manifest.name}@${manifest.version}`,
      );
      const result = spawnSync('npm', args, {
        cwd: dir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
    if (!hasRelease && !dryRun) {
      const args = [
        'release',
        'create',
        releaseTag(manifest),
        '--repo',
        REPOSITORY,
        '--target',
        sha,
        '--title',
        `${manifest.name} ${manifest.version}`,
        '--notes',
        releaseNotes(manifest, readChangelog(dir)),
        '--latest=false',
      ];
      if (manifest.version.includes('-')) args.push('--prerelease');
      const result = run('gh', args);
      if (!result.ok) {
        console.error(
          `gh release create ${releaseTag(manifest)} failed: ${result.stderr}`,
        );
        process.exit(1);
      }
      console.log(`released ${releaseTag(manifest)}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
