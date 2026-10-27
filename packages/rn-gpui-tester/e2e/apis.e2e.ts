import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
afterAll(() => app?.disconnect());

test('the apis screen opens', async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--apis',
      RN_GPUI_DEV_PORT: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-apis')).toBeVisible();
  await desktopExpect(app.getByTestId('apis-fixture')).toBeVisible();
  const version = await app.getByTestId('platform-version').textContent();
  expect(version).not.toBe('');
  expect(version).not.toBe('unknown');
  expect(await app.getByTestId('platform-is-testing').textContent()).toBe(
    'true',
  );
  await app.close();
});
