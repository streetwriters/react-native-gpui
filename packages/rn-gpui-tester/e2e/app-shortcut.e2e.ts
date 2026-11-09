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
      RN_GPUI_MODULE: 'RNGPUITester--app-shortcut',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-app-shortcut'),
  ).toBeVisible();
});

afterAll(() => app?.close());

test('an app shortcut on the keys of a default menu accelerator wins the key', async () => {
  await app.press('mod-w');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('app-shortcut-log')).toHaveText(
    'close-tab',
  );
  expect((await app.listWindows()).windows.length).toBeGreaterThan(0);
});

test('the same shortcut wins the key while a view has focus', async () => {
  await app.getByTestId('app-shortcut-focus').click();
  await app.waitForIdle();
  await app.press('mod-w');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('app-shortcut-log')).toHaveText(
    'close-tab close-tab',
  );
  expect((await app.listWindows()).windows.length).toBeGreaterThan(0);
});
