import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

/**
 * Development behaviour of a native tree: Fast Refresh reaches components inside
 * it and keeps their state, and an error one of them throws is reported like any
 * other render error. Both need a development bundle, which this test builds.
 */

let app: DesktopApp;
const bundle = path.resolve(
  'packages/rn-gpui-tester/desktop/build/test-e2e-dev.bundle',
);

beforeAll(async () => {
  execFileSync(
    'npx',
    [
      '--no-install',
      'react-native',
      'bundle',
      '--platform',
      'desktop',
      '--entry-file',
      'e2e/entry.ts',
      '--bundle-output',
      bundle,
      '--assets-dest',
      path.resolve('packages/rn-gpui-tester/desktop/build/assets'),
      '--dev',
      'true',
      '--config',
      'desktop/metro.config.js',
      '--max-workers',
      '2',
    ],
    {
      cwd: path.resolve('packages/rn-gpui-tester'),
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  );
  app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'NativeRootDevFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 400);
  await desktopExpect(app.getByTestId('dev-root')).toBeVisible();
}, 240_000);

afterAll(() => app?.close());

const texts = async (text: string) =>
  (await app.query('text', text, false)).length;

test('Fast Refresh re-renders a component inside the tree with the new code and keeps its state', async () => {
  expect(await texts('v1 count 0')).toBe(1);
  await app.getByTestId('dev-box').click();
  await expect.poll(() => texts('v1 count 1')).toBe(1);

  await app.getByTestId('dev-edit').click();
  await expect.poll(() => texts('v2 count 1')).toBe(1);
  expect(await texts('v1 count')).toBe(0);
});

test('an error thrown inside the tree is reported like any render error', async () => {
  app.allowErrors(/./u);
  await app.getByTestId('dev-break').click();
  await expect
    .poll(
      async () =>
        app.logs.join('\n').includes('boom inside the native tree') ||
        (await texts('boom inside the native tree')) > 0,
      { timeout: 10_000 },
    )
    .toBe(true);
});
