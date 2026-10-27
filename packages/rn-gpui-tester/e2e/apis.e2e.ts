import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
afterAll(() => app?.disconnect());

async function launch({ offscreen = true } = {}) {
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
    offscreen,
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

async function poll(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for the condition: ${check}`);
}

test('window hooks report focus per window and the window size', async () => {
  // An offscreen window is never active, so focus needs a real one.
  await launch({ offscreen: false });
  await app.setWindowSize(900, 700);
  const { width } = await app.getWindowBounds();
  await poll(async () => (await text('window-width')) === String(width));
  await app.getByTestId('window-open-child').click();
  await desktopExpect(app.getByTestId('desktop-child-focus')).toBeVisible();
  await poll(async () => (await text('desktop-child-focus')) === 'true');
  await poll(async () => (await text('window-focus')) === 'false');
  expect(await text('desktop-child-width')).toBe('420');
  await app.focusWindow();
  await poll(async () => (await text('window-focus')) === 'true');
  await poll(async () => (await text('desktop-child-focus')) === 'false');
});

test('Dimensions reports the screen, the font scale and each window', async () => {
  await launch();
  const [screenWidth, screenHeight] = (await text('dimensions-screen'))
    .split('x')
    .map(Number);
  expect(screenWidth).toBeGreaterThan(0);
  expect(screenHeight).toBeGreaterThan(0);
  expect(Number(await text('dimensions-font-scale'))).toBeGreaterThan(0);
  if (process.platform === 'darwin') {
    expect(await text('dimensions-font-scale')).toBe('1');
  }
  expect(await text('dimensions-window-width')).toBe('1024');
  expect(screenWidth).not.toBe(1024);
  await app.getByTestId('window-open-child').click();
  await desktopExpect(
    app.getByTestId('desktop-child-dimensions-width'),
  ).toBeVisible();
  await poll(
    async () => (await text('desktop-child-dimensions-width')) === '420',
  );
  expect(await text('dimensions-window-width')).toBe('1024');
});

test('AppState ignores focus moving between app windows', async () => {
  await launch({ offscreen: false });
  await app.focusWindow();
  await poll(async () => (await text('appstate-current')) === 'active');
  await app.getByTestId('window-open-child').click();
  await poll(async () => (await text('window-focus')) === 'false');
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(await text('appstate-log')).toBe('active');
});

test('AppState is background while no window is visible', async () => {
  await launch({ offscreen: false });
  await app.focusWindow();
  await poll(async () => (await text('appstate-current')) === 'active');
  await app.getByTestId('appstate-hide').click();
  await poll(async () => (await text('appstate-log')).includes('background'));
});
