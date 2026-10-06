import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const projectRoot = path.join(repoRoot, 'packages/rn-gpui-tester');
const appName = 'rn-gpui-tester';
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--manifest-path',
      path.join(projectRoot, 'desktop/Cargo.toml'),
      '--no-deps',
      '--format-version',
      '1',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  ),
);
const binary = path.join(metadata.target_directory, 'debug', appName);
const pidFile = path.join(repoRoot, '.local/7.16-e2e.pid');

function stopPreviousTestApp() {
  const candidates = new Set();
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 1) candidates.add(pid);
  }
  const processList = execFileSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
  });
  const commandsByPid = new Map();
  for (const line of processList.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/u);
    if (match) commandsByPid.set(Number(match[1]), match[2]);
    if (
      match &&
      (match[2].endsWith(`/${appName}`) || /\/rn-gpui-tester$/u.test(match[2]))
    ) {
      candidates.add(Number(match[1]));
    }
  }
  for (const pid of [...candidates]) {
    if (!commandsByPid.get(pid)?.includes(appName)) candidates.delete(pid);
  }
  for (const pid of candidates) {
    if (pid === process.pid) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  if (candidates.size)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  for (const pid of candidates) {
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
  fs.rmSync(pidFile, { force: true });
}

function stopPreviousNetworkFixture() {
  const processList = execFileSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
  });
  for (const line of processList.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/u);
    if (
      match &&
      Number(match[1]) !== process.pid &&
      /(?:^|\/)node(?:\s|$)/u.test(match[2]) &&
      match[2].includes('packages/rn-gpui-tester/scripts/network-fixture.mjs')
    ) {
      try {
        process.kill(Number(match[1]), 'SIGTERM');
      } catch {}
    }
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status}`,
    );
}

stopPreviousTestApp();
stopPreviousNetworkFixture();
run(
  'npx',
  [
    '--no-install',
    'react-native',
    'bundle',
    '--platform',
    'gpui',
    '--entry-file',
    'e2e/entry.ts',
    '--bundle-output',
    'desktop/build/test-e2e.bundle',
    '--assets-dest',
    'desktop/build/test-e2e-assets',
    '--dev',
    'false',
    '--config',
    'desktop/metro.config.js',
    '--max-workers',
    '2',
  ],
  projectRoot,
);
run(
  'npx',
  [
    '--no-install',
    'react-native',
    'run-desktop',
    '--features',
    'test-driver',
    '--no-launch',
    '--entry-file',
    'e2e/entry.ts',
    '--port',
    '8082',
  ],
  projectRoot,
);

if (!fs.existsSync(binary)) throw new Error(`e2e binary not found: ${binary}`);
const networkFixture = spawn(
  process.execPath,
  [path.join(repoRoot, 'packages/rn-gpui-tester/scripts/network-fixture.mjs')],
  { cwd: repoRoot, stdio: ['ignore', 'pipe', 'inherit'] },
);
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out starting the local network fixture')),
      5_000,
    );
    networkFixture.once('error', reject);
    networkFixture.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Network fixture exited before ready (${code})`));
    });
    networkFixture.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      if (String(chunk).includes('GPUI network fixture listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  const env = {
    ...process.env,
    RN_GPUI_TEST_BINARY: binary,
    RN_GPUI_TEST_BUNDLE: path.join(
      projectRoot,
      'desktop/build/test-e2e.bundle',
    ),
    RN_GPUI_DEV_PORT: '1',
    RN_GPUI_TEST_METRO_PORT: '8082',
    RN_GPUI_TEST_KEEP_APP: '1',
    RN_GPUI_UPDATE_SNAPSHOTS:
      process.argv.includes('-u') || process.argv.includes('--update')
        ? '1'
        : process.env.RN_GPUI_UPDATE_SNAPSHOTS,
  };
  run(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      path.join(repoRoot, 'vitest.e2e.config.ts'),
      ...process.argv.slice(2),
    ],
    repoRoot,
    env,
  );
} finally {
  networkFixture.kill('SIGTERM');
}
