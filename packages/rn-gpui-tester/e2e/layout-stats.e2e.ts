import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
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
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--stretch',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-stretch')).toBeVisible();
});

afterAll(() => app?.close());

test('layoutStats reports the work of the frames since the last reset', async () => {
  await app.layoutStats({ reset: true });
  await app.getByTestId('stretch-widen').click();
  await app.waitForIdle();
  const stats = await app.layoutStats({ reset: true });
  expect(stats.frames).toBeGreaterThan(0);
  expect(stats.layoutNodes).toBeGreaterThan(10);
  expect(stats.nodesReused).toBeGreaterThan(0);
  expect(stats.prepaintMs).toBeGreaterThan(0);
  expect(stats.paintMs).toBeGreaterThan(0);
  const idle = await app.layoutStats();
  expect(idle.frames).toBeLessThan(stats.frames + 3);
});
