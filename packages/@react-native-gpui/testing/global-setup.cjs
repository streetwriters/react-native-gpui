const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

// npm ships npx as npx.cmd on Windows, where child_process cannot resolve a
// command without its extension, and Node refuses to spawn .cmd/.bat files
// without a shell (the CVE-2024-27980 fix), so npx runs through the shell
// there. A shell joins the arguments into one command line, so arguments with
// spaces are quoted here first.
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npxShell = process.platform === 'win32';
const npxArgs = args =>
  npxShell ? args.map(arg => (/\s/u.test(arg) ? `"${arg}"` : arg)) : args;

module.exports = async function (vitestProject) {
  if (vitestProject?.config?.snapshotOptions?.updateSnapshot === 'all')
    process.env.RN_GPUI_UPDATE_SNAPSHOTS = '1';
  if (process.env.RN_GPUI_TEST_MODE === 'metro') await startMetro();
  if (process.env.RN_GPUI_TEST_BINARY) return require('./global-teardown.cjs');
  const project = path.resolve(
    process.env.RN_GPUI_TEST_PROJECT ?? process.cwd(),
  );
  execFileSync(
    npxCommand,
    npxArgs([
      '--no-install',
      'react-native',
      'run-desktop',
      '--release',
      '--features',
      'test-driver',
      '--no-launch',
      ...(process.env.RN_GPUI_TEST_ENTRY_FILE
        ? ['--entry-file', process.env.RN_GPUI_TEST_ENTRY_FILE]
        : []),
    ]),
    { cwd: project, stdio: 'inherit', shell: npxShell },
  );
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--manifest-path',
        path.join(project, 'desktop/Cargo.toml'),
        '--no-deps',
        '--format-version',
        '1',
      ],
      { cwd: project, encoding: 'utf8' },
    ),
  );
  const root = metadata.packages.find(
    pkg => pkg.manifest_path === path.join(project, 'desktop/Cargo.toml'),
  );
  const executable = root?.targets.find(target => target.kind.includes('bin'));
  if (!executable)
    throw new Error('desktop/Cargo.toml must define an app binary');
  process.env.RN_GPUI_TEST_BINARY = path.join(
    metadata.target_directory,
    'release',
    executable.name + (process.platform === 'win32' ? '.exe' : ''),
  );
  process.env.RN_GPUI_TEST_BUNDLE = path.join(
    project,
    'desktop/build/index.bundle',
  );
  return require('./global-teardown.cjs');
};

async function startMetro() {
  const fs = require('node:fs');
  const net = require('node:net');
  const project = path.resolve(
    process.env.RN_GPUI_TEST_PROJECT ?? process.cwd(),
  );
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(() => resolve(selected));
    });
  });
  const log = path.join(project, '.local/metro-e2e.log');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, 'w');
  const metroEnv = { ...process.env, NODE_ENV: 'development' };
  delete metroEnv.VITEST_WORKER_ID;
  delete metroEnv.VITEST_POOL_ID;
  const child = spawn(
    npxCommand,
    npxArgs([
      '--no-install',
      'react-native',
      'start',
      '--port',
      String(port),
      '--config',
      path.join(project, 'desktop/metro.config.js'),
    ]),
    {
      cwd: project,
      env: metroEnv,
      detached: true,
      stdio: ['ignore', fd, fd],
      shell: npxShell,
    },
  );
  fs.closeSync(fd);
  child.unref();
  process.env.RN_GPUI_TEST_METRO_PID = String(child.pid);
  process.env.RN_GPUI_DEV_HOST = '127.0.0.1';
  process.env.RN_GPUI_DEV_PORT = String(port);
  process.env.RN_GPUI_SOURCE_URL = (
    process.env.RN_GPUI_TEST_ENTRY_FILE ?? 'index.js'
  ).replace(/\.[^.]+$/u, '');
  const deadline = Date.now() + 30000;
  try {
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/status`);
        if ((await response.text()).includes('packager-status:running')) return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Metro did not become ready. See ${log}`);
  } catch (error) {
    require('./global-teardown.cjs')();
    throw error;
  }
}
