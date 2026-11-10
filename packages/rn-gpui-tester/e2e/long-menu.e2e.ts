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
      RN_GPUI_MODULE: 'RNGPUITester--long-menu',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(500, 400);
  await desktopExpect(app.getByTestId('long-menu-open')).toBeVisible();
});

afterAll(() => app?.close());

test('a menu taller than the window scrolls and the keyboard keeps the highlighted row in view', async () => {
  await app.getByTestId('long-menu-open').click();
  await desktopExpect(app.getByTestId('menu-item-long-0')).toBeVisible();
  const [panel] = await app.query('role', 'menu', true);
  expect(panel.frame.height).toBeLessThanOrEqual(400 * 0.8);
  expect(panel.frame.height).toBeGreaterThan(200);
  const last = () => app.query('testID', 'menu-item-long-49', true);
  expect((await last())[0].visible).toBe(false);

  await app.focus(panel.tag);
  await app.press('end');
  await app.waitForIdle();
  const [row] = await last();
  expect(row.visible).toBe(true);
  expect(row.frame.y + row.frame.height).toBeLessThanOrEqual(
    panel.frame.y + panel.frame.height,
  );
  expect(row.frame.y).toBeGreaterThanOrEqual(panel.frame.y);
  const [first] = await app.query('testID', 'menu-item-long-0', true);
  expect(first.visible).toBe(false);

  await app.press('enter');
  await desktopExpect(app.getByTestId('long-menu-chosen')).toHaveText(
    'long-49',
  );
});
