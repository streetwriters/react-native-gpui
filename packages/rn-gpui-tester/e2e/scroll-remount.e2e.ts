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
      RN_GPUI_MODULE: 'RNGPUITester--scroll-remount',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('remount-scroll')).toBeVisible();
});

afterAll(() => app?.close());

async function text(testID: string) {
  const [node] = await app.query('testID', testID, true);
  return node.text as string;
}

test('a ScrollView mounted with a new key starts at offset 0', async () => {
  const [scroll] = await app.query('testID', 'remount-scroll', true);
  await app.scroll(scroll.tag, 0, -500);
  await app.waitForIdle();
  expect(Number(await text('remount-offset'))).toBeGreaterThanOrEqual(450);
  const [key] = await app.query('testID', 'remount-key', true);
  await app.focus(key.tag);
  await app.press('a');
  await app.waitForIdle();
  expect(await text('remount-generation')).toBe('1');
  const [fresh] = await app.query('testID', 'remount-scroll', true);
  await app.scroll(fresh.tag, 0, -1);
  await app.waitForIdle();
  expect(Number(await text('remount-offset'))).toBeLessThan(50);
});
