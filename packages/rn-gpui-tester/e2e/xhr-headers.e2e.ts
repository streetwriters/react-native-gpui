import http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((request, response) => {
    response.setHeader('ETag', '"etag-1"');
    response.setHeader('X-Dup', ['one', 'two']);
    response.setHeader('X-Object-Size', '4096');
    response.setHeader('Content-Type', 'text/plain');
    response.end(request.method === 'HEAD' ? undefined : 'body!');
  });
  await new Promise<void>(resolve =>
    server.listen(38530, '127.0.0.1', resolve),
  );
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--xhr-headers',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('xhr-done')).toBeVisible(15000);
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>(resolve => server?.close(() => resolve()));
});

test('XMLHttpRequest reports response headers by name, joining duplicates', async () => {
  const text = (id: string) => app.getByTestId(id).textContent();
  const all = JSON.parse((await text('xhr-all')).slice('all:'.length));
  expect(all).toContain('etag: "etag-1"\r\n');
  expect(all).toContain('x-dup: one, two\r\n');
  expect(all).toContain('content-type: text/plain\r\n');
  expect(all).not.toMatch(/^\d+: /mu);
  expect(await text('xhr-etag')).toBe('etag:"etag-1"');
  expect(await text('xhr-length')).toBe('length:5');
  expect(await text('xhr-dup')).toBe('dup:one, two');
  expect(await text('xhr-missing')).toBe('missing:null');
  expect(await text('xhr-head')).toBe('head:4096');
});
