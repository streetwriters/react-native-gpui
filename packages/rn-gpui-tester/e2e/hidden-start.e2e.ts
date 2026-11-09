import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  frontmostApplicationPid,
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    args: ['--hidden'],
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--hidden-start',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_TEST_ON_TOP: '1',
    },
    disableAnimations: true,
    offscreen: false,
  });
  await app.setWindowSize(1024, 768);
});

afterAll(() => app?.close());

test('an app started with --hidden mounts and renders while its window is not shown', async () => {
  expect((await app.windowState(1)).isVisible).toBe(false);
  await desktopExpect(app.getByTestId('hidden-marker')).toBeVisible();
  await desktopExpect(app.getByTestId('hidden-visible')).toHaveText('false');
  expect(frontmostApplicationPid()).not.toBe(app.pid);
});

test('showing it makes the window visible and opaque with its content, without taking focus', async () => {
  await expect
    .poll(async () => (await app.windowState(1)).isVisible, { timeout: 8_000 })
    .toBe(true);
  await desktopExpect(app.getByTestId('hidden-visible')).toHaveText('true');
  await expect
    .poll(() => app.windowReveal(), { timeout: 2_000 })
    .toEqual({ alpha: 1, revealedBy: 'frame' });
  const screenshot = await app.screenshot();
  expect(screenshot.length).toBeGreaterThan(1000);
  expect(frontmostApplicationPid()).not.toBe(app.pid);
});
