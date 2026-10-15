#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { request as httpsRequest } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const WORKFLOW_FILE = 'hermes-engine.yml';
const ARTIFACT_PREFIX = 'hermes-';
const RELEASE_PREFIX = '@react-native-gpui/hermes@';
const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY ?? 'streetwriters/react-native-gpui';
const MAX_REDIRECTS = 8;
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const binRoot = path.join(packageRoot, 'bin');

const PLATFORMS = {
  'darwin-arm64': ['libhermesvm.dylib', 'hermesc'],
  'darwin-x64': ['libhermesvm.dylib', 'hermesc'],
  'linux-x64': ['libhermesvm.so', 'hermesc'],
  'linux-arm64': ['libhermesvm.so', 'hermesc'],
  'win32-x64': ['hermesvm.dll', 'hermesvm.lib', 'hermesc.exe'],
  'win32-arm64': ['hermesvm.dll', 'hermesvm.lib', 'hermesc.exe'],
};

function usage() {
  console.log(
    [
      'Usage: node scripts/fetch-binaries.mjs [options]',
      '',
      '  (no options)          download this platform from the pinned release',
      '  --run <run-id>        download a specific workflow run',
      '  --tag <release-tag>   download hermes-*.zip assets from a GitHub release',
      '  --from <zip|dir>      install a manually downloaded artifact',
      '  --platform <key>      limit to one of: ' +
        Object.keys(PLATFORMS).join(', '),
      '  --verify              report the binaries installed for this host',
      '  --verify --all        report every platform',
      '  --help                show this message',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const options = { mode: 'latest', platform: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.mode = 'help';
    } else if (arg === '--verify') {
      options.mode = 'verify';
    } else if (arg === '--run') {
      options.mode = 'run';
      options.runId = argv[++i];
    } else if (arg === '--tag') {
      options.mode = 'tag';
      options.tag = argv[++i];
    } else if (arg === '--from') {
      options.mode = 'from';
      options.from = argv[++i];
    } else if (arg === '--platform') {
      options.platform = argv[++i];
    } else if (arg === '--all') {
      options.all = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.platform && !PLATFORMS[options.platform])
    throw new Error(`Unknown platform: ${options.platform}`);
  return options;
}

function selectedPlatforms(options) {
  if (options.platform) return [options.platform];
  if (options.all) return Object.keys(PLATFORMS);
  const host = `${process.platform}-${process.arch}`;
  if (!PLATFORMS[host])
    throw new Error(
      `No Hermes binaries are defined for this host (${host}); use --platform or --all.`,
    );
  return [host];
}

function missingFiles(platform) {
  return PLATFORMS[platform].filter(
    file => !fs.existsSync(path.join(binRoot, platform, file)),
  );
}

function missingPlatforms(options) {
  return selectedPlatforms(options).filter(
    platform => missingFiles(platform).length > 0,
  );
}

function verify(options) {
  let missing = 0;
  for (const platform of selectedPlatforms(options)) {
    const dir = path.join(binRoot, platform);
    const found = PLATFORMS[platform].filter(file =>
      fs.existsSync(path.join(dir, file)),
    );
    const state =
      found.length === PLATFORMS[platform].length
        ? 'ok'
        : found.length === 0
          ? 'missing'
          : `partial (${found.join(', ')})`;
    if (found.length !== PLATFORMS[platform].length) missing += 1;
    console.log(`${platform.padEnd(14)} ${state}`);
  }
  if (missing) {
    console.log(
      `\n${missing} platform(s) without binaries. Run the hermes-engine workflow and install the artifacts with --from, or use --run/--tag with gh installed.`,
    );
    process.exitCode = 1;
  }
  return missing === 0;
}

function extractArchive(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (process.platform === 'win32') {
    // Use the bsdtar that ships with Windows; the GNU tar from Git for Windows
    // (first on PATH in bash steps) cannot read zip files.
    const systemTar = path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'tar.exe',
    );
    const tar = fs.existsSync(systemTar) ? systemTar : 'tar';
    execFileSync(tar, ['-xf', archive, '-C', destination], {
      stdio: 'inherit',
    });
    return;
  }
  execFileSync('unzip', ['-oq', archive, '-d', destination], {
    stdio: 'inherit',
  });
}

/**
 * Copies the platform trees found under `sourceRoot` into the package. Two
 * layouts are accepted: `bin/<platform>/` as written by the local build scripts
 * and the release zips, and `<platform>/` at the root of a `hermes-<platform>`
 * artifact, because actions/upload-artifact uploads `bin/` without its prefix.
 */
function installFrom(sourceRoot, options) {
  const wanted = new Set(selectedPlatforms(options));
  const installed = [];
  const install = (from, platform) => {
    const to = path.join(binRoot, platform);
    fs.mkdirSync(to, { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    for (const file of fs.readdirSync(to)) {
      if (file === 'hermesc' || file === 'hermesc.exe')
        fs.chmodSync(path.join(to, file), 0o755);
    }
    installed.push(platform);
    wanted.delete(platform);
  };
  const visit = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (wanted.has(entry.name)) {
        install(child, entry.name);
      } else if (
        entry.name === 'bin' ||
        entry.name === 'artifacts' ||
        entry.name === 'download' ||
        entry.name.startsWith(ARTIFACT_PREFIX)
      ) {
        visit(child);
      }
    }
  };
  visit(sourceRoot);
  if (installed.length === 0)
    throw new Error(
      `No hermes-<platform> artifacts with <platform>/ or bin/<platform>/ under ${sourceRoot}`,
    );
  console.log(`Installed: ${installed.join(', ')}`);
}

function gh(args, options = {}) {
  return execFileSync('gh', args, { stdio: 'inherit', ...options });
}

function downloadFromRun(options) {
  let runId = options.runId;
  if (!runId) {
    runId = execFileSync(
      'gh',
      [
        'run',
        'list',
        '--workflow',
        WORKFLOW_FILE,
        '--status',
        'success',
        '--limit',
        '1',
        '--json',
        'databaseId',
        '--jq',
        '.[0].databaseId',
      ],
      { encoding: 'utf8' },
    ).trim();
    if (!runId)
      throw new Error('No successful hermes-engine workflow run found');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-binaries-'));
  console.log(`Downloading hermes-engine run ${runId} into ${dir}`);
  gh(['run', 'download', runId, '--dir', dir]);
  installFrom(dir, options);
  fs.rmSync(dir, { recursive: true, force: true });
}

function downloadFromRelease(options) {
  if (!options.tag) throw new Error('--tag needs a release tag');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-binaries-'));
  console.log(`Downloading ${options.tag} assets into ${dir}`);
  gh([
    'release',
    'download',
    options.tag,
    '--dir',
    dir,
    '--pattern',
    `${ARTIFACT_PREFIX}${options.platform ?? '*'}.zip`,
    '--clobber',
  ]);
  for (const file of fs.readdirSync(dir))
    if (file.endsWith('.zip'))
      extractArchive(path.join(dir, file), path.join(dir, file.slice(0, -4)));
  installFrom(dir, options);
  fs.rmSync(dir, { recursive: true, force: true });
}

function offline() {
  return (
    process.env.RN_GPUI_PREBUILT_OFFLINE === '1' ||
    process.env.CARGO_NET_OFFLINE === 'true'
  );
}

/**
 * Follows redirects, streams the body to dest, and drops the authorization
 * header when a redirect leaves GitHub. Same behaviour as the prebuilt runtime
 * download, so a proxy or mirror that replays GitHub's redirects works here too.
 */
function download(url, dest, redirects = 0, headers = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS)
      return reject(new Error('too many redirects'));
    const parsed = new URL(url);
    const req = httpsRequest(
      parsed,
      { headers: { 'user-agent': 'react-native-gpui-hermes', ...headers } },
      res => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          const next = new URL(res.headers.location, parsed).toString();
          const host = new URL(next).hostname;
          const keep =
            host.endsWith('github.com') ||
            host.endsWith('githubusercontent.com');
          return resolve(
            download(next, dest, redirects + 1, keep ? headers : {}),
          );
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Downloads the platform's zip from the release named after this package's own
 * version, so a fresh checkout can build without the hermes-engine workflow
 * having been run by hand. A platform that already has a complete, verified
 * `bin/<platform>/` is left alone; offline mode never reaches the network.
 */
async function downloadFromPin() {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const tag = `${RELEASE_PREFIX}${version}`;
  const missing = missingPlatforms({});
  if (missing.length === 0) {
    console.log(`Hermes binaries for this host are installed (${tag})`);
    return;
  }
  if (offline())
    throw new Error(
      `Hermes binaries are missing (${missing.join(', ')}) and offline mode is on; install them with --from or clear RN_GPUI_PREBUILT_OFFLINE.`,
    );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-binaries-'));
  for (const platform of missing) {
    const file = `${ARTIFACT_PREFIX}${platform}.zip`;
    const archive = path.join(dir, file);
    const url = `https://github.com/${GITHUB_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${file}`;
    const headers = {};
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    // github.com answers a missing asset with a 404 page, which unzip would
    // report as a corrupt archive; ask for the bytes like the release download.
    headers.accept = 'application/octet-stream';
    if (token) headers.authorization = `Bearer ${token}`;
    console.log(`Downloading ${url}`);
    await download(url, archive, 0, headers);
    extractArchive(archive, dir);
  }
  installFrom(dir, {});
  fs.rmSync(dir, { recursive: true, force: true });
}

function installFromPath(options) {
  if (!options.from)
    throw new Error('--from needs an artifact zip or directory');
  const source = path.resolve(options.from);
  if (!fs.existsSync(source)) throw new Error(`Not found: ${source}`);
  if (fs.statSync(source).isDirectory()) {
    installFrom(source, options);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-binaries-'));
  extractArchive(source, dir);
  installFrom(dir, options);
  fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'help') return usage();
  if (options.mode === 'verify') return verify(options);
  if (options.mode === 'from') return installFromPath(options);
  if (options.mode === 'run') return downloadFromRun(options);
  if (options.mode === 'tag') return downloadFromRelease(options);
  return downloadFromPin();
}

try {
  await main();
} catch (error) {
  console.error(`fetch-binaries: ${error.message}`);
  process.exitCode = 1;
}
