import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// npm ships npx as npx.cmd on Windows, where child_process cannot resolve a
// command without its extension, and Node refuses to spawn .cmd/.bat files
// without a shell (the CVE-2024-27980 fix), so npx runs through the shell
// there. A shell joins the arguments into one command line, so arguments with
// spaces are quoted here first.
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npxShell = process.platform === 'win32';
const npxArgs = args =>
  npxShell ? args.map(arg => (/\s/u.test(arg) ? `"${arg}"` : arg)) : args;

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
const keepApp =
  process.env.RN_GPUI_KEEP_APP === '1' || process.argv.includes('--keep-app');
const headed =
  process.env.RN_GPUI_HEADED === '1' || process.argv.includes('--headed');
const passthrough = process.argv
  .slice(2)
  .filter(arg => arg !== '--keep-app' && arg !== '--headed');

/**
 * A locked macOS session has no displays: GPUI asks the window server for them
 * and `bootstrap` waits for one before entering AppKit, so every test fails
 * with "Timed out waiting for the GPUI test-driver port" after 30 s each. Check
 * once, up front, and say why.
 */
function assertScreenIsUnlocked() {
  if (process.platform !== 'darwin') return;
  if (process.env.RN_GPUI_ALLOW_LOCKED_SCREEN === '1') return;
  let output;
  try {
    output = execFileSync('ioreg', ['-n', 'Root', '-d1', '-a'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return;
  }
  if (!/<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/u.test(output)) return;
  throw new Error(
    'the macOS session is locked, so GPUI cannot see a display and no test ' +
      'app can start (every test would time out after 30 s). Unlock the ' +
      'screen and re-run, or set RN_GPUI_ALLOW_LOCKED_SCREEN=1 to try anyway.',
  );
}

function stopTestApps() {
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
  return [...candidates];
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

function run(command, args, cwd, env = process.env, shell = false) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status}`,
    );
}

/**
 * The AccessKit adapters activate only while the session bus reports
 * `org.a11y.Status.IsEnabled`. Without an assistive client connected it is
 * false, so the native accessibility tree stays empty and the a11y assertions
 * have nothing to read. Read the current value, enable it for the run, and put
 * it back afterwards. Returns undefined when there is no AT-SPI bus.
 */
function readA11yEnabled() {
  try {
    const output = execFileSync(
      'busctl',
      [
        '--user',
        'get-property',
        'org.a11y.Bus',
        '/org/a11y/bus',
        'org.a11y.Status',
        'IsEnabled',
      ],
      { encoding: 'utf8' },
    ).trim();
    return output.endsWith('true');
  } catch {
    return undefined;
  }
}

function setA11yEnabled(value) {
  execFileSync('busctl', [
    '--user',
    'set-property',
    'org.a11y.Bus',
    '/org/a11y/bus',
    'org.a11y.Status',
    'IsEnabled',
    'b',
    String(value),
  ]);
}

stopTestApps();
stopPreviousNetworkFixture();
// The Node-API fixture must exist before Metro runs on Linux and macOS: the
// Babel plugin only rewrites a `require()` when the `.node` file is already on
// disk. On Windows the script writes nothing (Part D1), the plugin turns the
// require into a throwing expression, and the skipped e2e test never needs it.
run(
  process.execPath,
  [path.join(projectRoot, 'scripts/build-node-addon.mjs')],
  repoRoot,
  process.env,
);
run(
  npxCommand,
  npxArgs([
    '--no-install',
    'react-native',
    'bundle',
    '--platform',
    'gpui',
    '--entry-file',
    'e2e/entry.ts',
    '--bundle-output',
    'desktop/build/test-e2e.bundle',
    // Must be the parent of the `assets/assets` directory the app resolves
    // `file://assets/...` URIs against. The testing client derives that from
    // the bundle path (`<bundle dir>/assets/assets`), so a different
    // `--assets-dest` leaves the app reading stale assets.
    '--assets-dest',
    'desktop/build/assets',
    '--dev',
    'false',
    '--config',
    'desktop/metro.config.js',
    '--max-workers',
    '2',
  ]),
  projectRoot,
  process.env,
  npxShell,
);
assertScreenIsUnlocked();

run(
  npxCommand,
  npxArgs([
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
  ]),
  projectRoot,
  process.env,
  npxShell,
);

let a11yPrevious;
let nativeA11y = false;
if (process.platform === 'linux') {
  // With the AT-SPI bus on and a *visible* window, GPUI disables its
  // retained-view fast path and the retention test fails (see GPUI_PIN.md).
  // Offscreen windows never refresh from events, so those runs are unaffected.
  // A headed run therefore leaves the bus alone; the caller can force the old
  // behaviour with RN_GPUI_TEST_NATIVE_A11Y=1.
  const forceNativeA11y = process.env.RN_GPUI_TEST_NATIVE_A11Y === '1';
  if (headed && !forceNativeA11y) {
    console.log(
      '[e2e] headed run: native accessibility stays off (set RN_GPUI_TEST_NATIVE_A11Y=1 to force it)',
    );
  } else {
    a11yPrevious = readA11yEnabled();
    if (a11yPrevious === undefined) {
      console.warn(
        '[e2e] no AT-SPI session bus; native accessibility assertions will be skipped',
      );
    } else {
      try {
        setA11yEnabled(true);
        nativeA11y = true;
      } catch (error) {
        console.warn(`[e2e] could not enable the AT-SPI bus: ${error.message}`);
      }
    }
  }
  const restoreA11y = () => {
    if (a11yPrevious !== undefined) {
      try {
        setA11yEnabled(a11yPrevious);
      } catch {}
    }
  };
  process.on('exit', restoreA11y);
  process.on('SIGINT', () => {
    restoreA11y();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    restoreA11y();
    process.exit(143);
  });
}

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
  console.log(
    `[e2e] headed=${headed ? 'yes' : 'no'} keep-app=${keepApp ? 'yes' : 'no'}`,
  );
  const env = {
    ...process.env,
    RN_GPUI_TEST_BINARY: binary,
    RN_GPUI_TEST_BUNDLE: path.join(
      projectRoot,
      'desktop/build/test-e2e.bundle',
    ),
    RN_GPUI_DEV_PORT: '1',
    RN_GPUI_TEST_METRO_PORT: '8082',
    RN_GPUI_TEST_KEEP_APP: keepApp ? '1' : '0',
    RN_GPUI_TEST_HEADED: headed ? '1' : '0',
    RN_GPUI_TEST_NATIVE_A11Y: nativeA11y ? '1' : '0',
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
      ...(headed && !passthrough.some(arg => arg.startsWith('--maxWorkers'))
        ? ['--maxWorkers=1']
        : []),
      ...passthrough,
    ],
    repoRoot,
    env,
  );
} finally {
  networkFixture.kill('SIGTERM');
  if (!keepApp) {
    const reclaimed = stopTestApps();
    if (reclaimed.length)
      console.log(
        `[e2e] stopped ${reclaimed.length} leftover test app(s): ${reclaimed.join(', ')}`,
      );
  }
}
