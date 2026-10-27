import path from 'node:path';
import { afterAll, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
afterAll(() => app?.disconnect());

test('the core-components screen opens', async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--core-components',
      RN_GPUI_DEV_PORT: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-core-components'),
  ).toBeVisible();
  await desktopExpect(app.getByTestId('core-components-fixture')).toBeVisible();
  await app.close();
});
