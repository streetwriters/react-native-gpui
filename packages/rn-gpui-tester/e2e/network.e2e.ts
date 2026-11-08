import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

const PROXY_PORT = 38517;
const TARGET_PORT = 38518;

let app: DesktopApp;
const proxied: string[] = [];
const direct: string[] = [];
let proxy: http.Server;
let target: http.Server;
let dns: net.Server;
let secondDns: net.Server;
let connections = 0;

/** A name /etc/hosts gives to the loopback address, which only the system resolves. */
const loopbackAlias = (() => {
  try {
    for (const line of fs.readFileSync('/etc/hosts', 'utf8').split('\n')) {
      const [address, ...names] = line.replace(/#.*/u, '').trim().split(/\s+/u);
      if (address !== '127.0.0.1') continue;
      const name = names.find(
        candidate => candidate !== 'localhost' && /[a-z]/iu.test(candidate),
      );
      if (name) return name;
    }
  } catch {
    // No hosts file to read.
  }
  return undefined;
})();
let secondConnections = 0;

beforeAll(async () => {
  dns = net.createServer(socket => {
    connections += 1;
    socket.destroy();
  });
  await new Promise<void>(resolve => dns.listen(38519, '127.0.0.1', resolve));
  secondDns = net.createServer(socket => {
    secondConnections += 1;
    socket.destroy();
  });
  await new Promise<void>(resolve =>
    secondDns.listen(38520, '127.0.0.1', resolve),
  );
  proxy = http.createServer((request, response) => {
    proxied.push(`${request.method} ${request.url}`);
    response.end('from-proxy');
  });
  target = http.createServer((request, response) => {
    direct.push(`${request.method} ${request.url}`);
    response.end('from-target');
  });
  await Promise.all([
    new Promise<void>(resolve =>
      proxy.listen(PROXY_PORT, '127.0.0.1', resolve),
    ),
    new Promise<void>(resolve =>
      target.listen(TARGET_PORT, '127.0.0.1', resolve),
    ),
  ]);
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'NetworkFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    initialProps: { host: loopbackAlias },
    disableAnimations: true,
    offscreen: true,
  });
  app.allowErrors(/gpui-http/u);
  await desktopExpect(app.getByTestId('net-run-proxy')).toBeVisible();
});

afterAll(async () => {
  await app?.close();
  proxy?.close();
  target?.close();
  dns?.close();
  secondDns?.close();
});

async function run(name: string) {
  await app.getByTestId(`net-run-${name}`).click();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const text = await app.getByTestId(`net-result-${name}`).textContent();
    if (text) return text;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`${name} produced no result`);
}

test('a proxy URL carries a request whose host does not resolve', async () => {
  expect(await run('proxy')).toBe('200 from-proxy');
  expect(proxied).toContain('GET http://proxied.invalid/hello');
});

test('a bypassed host is requested directly, and fails here', async () => {
  const before = proxied.length;
  expect(await run('bypass')).toMatch(/^failed/);
  expect(proxied.length).toBe(before);
});

test('Chromium proxy rules pick a proxy per scheme', async () => {
  const result = await run('rules');
  expect(result).toContain('200 from-proxy');
  expect(result).toContain('https via http://127.0.0.1:1');
  expect(proxied).toContain('GET http://rules.invalid/hello');
});

test('direct sends the request straight to its server', async () => {
  const before = proxied.length;
  expect(await run('direct')).toBe('200 from-target');
  expect(direct).toContain('GET /hello');
  expect(proxied.length).toBe(before);
});

test('invalid proxy rules and non-https DNS servers are rejected', async () => {
  expect(await run('invalid')).toContain('rejected');
  const doh = await run('doh');
  expect(doh).toContain('rejected');
  expect(doh).toContain('| https://dns.invalid/dns-query | []');
});

test('the bypass list matches hosts, suffixes, ports, networks and loopback', async () => {
  // plain, a.internal, internal, corp:8443, corp:80, 10.x, 11.x, localhost, public
  expect(await run('bypassList')).toBe('DDPDPDPDP');
});

test('a DNS-over-HTTPS server is asked to resolve names', async () => {
  // The server is not a real one, and its certificate is not trusted either, so
  // the request fails; what counts is that the client went to it for the name.
  expect(await run('dohRequest')).toMatch(/^failed/);
  expect(connections).toBeGreaterThan(0);
});

test('several DNS-over-HTTPS servers are tried in order', async () => {
  const before = [connections, secondConnections];
  expect(await run('dohFallback')).toMatch(
    /^failed.*\| 2 https:\/\/127\.0\.0\.1:38519/u,
  );
  expect(connections).toBeGreaterThan(before[0]);
  expect(secondConnections).toBeGreaterThan(before[1]);
});

test.skipIf(loopbackAlias === undefined)(
  'a name no DNS-over-HTTPS server can resolve falls back to the system',
  async () => {
    const before = connections;
    expect(await run('dohSystem')).toBe('200 from-target');
    expect(connections).toBeGreaterThan(before);
  },
);
