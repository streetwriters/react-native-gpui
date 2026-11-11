import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';

// The tester build the e2e run makes writes its own bundle and starts no Metro,
// so this test starts one on a free port, unless a port is named for a Metro
// that is already running. The whole tester bundle is several megabytes and
// Metro has to bundle it on first request, which in a parallel run competes
// with the app processes for the machine, so the first request gets a long
// budget. Metro's dev middleware refuses to run when NODE_ENV is `test`, which
// vitest sets.
let metro: ChildProcess | undefined;
let port = process.env.RN_GPUI_TEST_METRO_PORT ?? '';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port: free } = server.address() as net.AddressInfo;
      server.close(() => resolve(free));
    });
  });
}

async function running(at: string) {
  try {
    const response = await fetch(`http://127.0.0.1:${at}/status`);
    return (await response.text()).includes('packager-status:running');
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (port && (await running(port))) return;
  port = String(await freePort());
  const windows = process.platform === 'win32';
  metro = spawn(
    windows ? 'npx.cmd' : 'npx',
    [
      '--no-install',
      'react-native',
      'start',
      '--host',
      '127.0.0.1',
      '--port',
      port,
      '--config',
      'desktop/metro.config.js',
      '--no-interactive',
    ],
    {
      cwd: path.resolve('packages/rn-gpui-tester'),
      stdio: 'ignore',
      env: { ...process.env, NODE_ENV: 'development' },
      shell: windows,
      detached: !windows,
    },
  );
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await running(port)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Metro did not start on port ${port}`);
}, 90_000);

afterAll(() => {
  if (!metro?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(metro.pid), '/t', '/f']);
  } else {
    try {
      process.kill(-metro.pid, 'SIGTERM');
    } catch {
      metro.kill('SIGTERM');
    }
  }
});

test('Metro serves the GPUI tester entry and menu screens', async () => {
  const response = await fetch(
    `http://127.0.0.1:${port}/index.bundle?platform=desktop&dev=false&minify=false`,
  );
  expect(response.ok).toBe(true);
  const bundle = await response.text();
  expect(bundle).toContain('React Native GPUI Tester');
  expect(bundle).toContain('tester-overview');
  expect(bundle).toContain('tester-menu-');
  expect(bundle).toContain('tester-screen-');
}, 180_000);
