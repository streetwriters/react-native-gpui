import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
afterAll(() => app?.disconnect());

async function launch() {
  if (app) await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--apis',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-apis-state.json'),
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-apis')).toBeVisible();
}

async function frameOf(testID: string) {
  const [node] = await app.query('testID', testID, true);
  if (!node) throw new Error(`no node for ${testID}`);
  return node.frame;
}

async function text(testID: string) {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

test('the apis screen opens and Platform reports the host', async () => {
  await launch();
  await desktopExpect(app.getByTestId('apis-fixture')).toBeVisible();
  const version = await text('platform-version');
  expect(version).not.toBe('');
  expect(version).not.toBe('unknown');
  expect(await text('platform-is-testing')).toBe('true');
});

test('forceRTL mirrors the layout after a reload and resets', async () => {
  await launch();
  expect(await text('i18n-is-rtl')).toBe('false');
  const ltrA = await frameOf('i18n-box-a');
  const ltrC = await frameOf('i18n-box-c');
  expect(ltrA.x).toBeLessThan(ltrC.x);
  try {
    await app.getByTestId('i18n-force-rtl').click();
    await launch();
    expect(await text('i18n-is-rtl')).toBe('true');
    const rtlA = await frameOf('i18n-box-a');
    const rtlB = await frameOf('i18n-box-b');
    const rtlC = await frameOf('i18n-box-c');
    expect(rtlA.x).toBeGreaterThan(rtlC.x);
    // marginStart lands on the right: the gap sits between B and C's far side.
    expect(rtlB.x - (rtlC.x + rtlC.width)).toBe(40);
  } finally {
    await app.getByTestId('i18n-reset-rtl').click();
    await launch();
  }
  expect(await text('i18n-is-rtl')).toBe('false');
});
