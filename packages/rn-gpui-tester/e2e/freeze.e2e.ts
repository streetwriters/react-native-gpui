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
      RN_GPUI_MODULE: 'RNGPUITester--freeze',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: false,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-freeze')).toBeVisible();
});

afterAll(() => app?.close());

test('the app settles after moving through several frozen routes', async () => {
  for (const route of ['notebook', 'tag', 'home', 'notebook', 'home']) {
    await app.getByTestId(`go-${route}`).click();
    await app.waitForIdle({ timeout: 8000 });
  }
  await app.getByTestId('route-home-bump').click();
  await app.waitForIdle({ timeout: 8000 });
  expect(await app.getByTestId('route-home-title').textContent()).toBe(
    'home 1',
  );
});
