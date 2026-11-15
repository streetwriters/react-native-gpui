import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { FITS_SMALL_DISPLAY, scrollIntoView } from './scroll-into-view';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
afterAll(() => app?.disconnect());

async function launch({ offscreen = true, height = 768 } = {}) {
  if (app) await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--apis',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_ALERT_DIALOG: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-apis-state.json'),
    },
    disableAnimations: true,
    // Pressable holds a press for 130 ms with a timer; waiting it out after
    // every click only costs time.
    idleOptions: { ignore: ['timers'] },
    offscreen,
  });
  await app.setWindowSize(1024, height);
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
  expect(await inkCentre('i18n-text')).toBeLessThan(0.3);
  try {
    await app.getByTestId('i18n-force-rtl').click();
    await launch();
    expect(await text('i18n-is-rtl')).toBe('true');
    const rtlA = await frameOf('i18n-box-a');
    const rtlB = await frameOf('i18n-box-b');
    const rtlC = await frameOf('i18n-box-c');
    expect(rtlA.x).toBeGreaterThan(rtlC.x);
    // marginStart lands on the right: the gap sits between B and C's far side.
    // Yoga rounds a node's position relative to its parent and its width from
    // the absolute edges, so at a fractional display scale (125% on Windows)
    // neighbouring edges can differ by a device pixel.
    expect(Math.abs(rtlB.x - (rtlC.x + rtlC.width) - 40)).toBeLessThanOrEqual(
      1,
    );
    // `textAlign: 'auto'` follows the writing direction.
    expect(await inkCentre('i18n-text')).toBeGreaterThan(0.7);
  } finally {
    await app.getByTestId('i18n-reset-rtl').click();
    await launch();
  }
  expect(await text('i18n-is-rtl')).toBe('false');
});

/** Where the dark pixels sit across a node, 0 at its left edge and 1 at its right. */
async function inkCentre(testID: string) {
  const image = PNG.sync.read(await app.getByTestId(testID).screenshot());
  let total = 0;
  let sum = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4] < 100) {
        total += 1;
        sum += x;
      }
    }
  }
  return total === 0 ? -1 : sum / total / image.width;
}

async function poll(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for the condition: ${check}`);
}

/** Resolves once `read` has returned the same value for `quiet` ms. */
async function settled(
  read: () => Promise<string>,
  quiet = 400,
  timeout = 8000,
) {
  const deadline = Date.now() + timeout;
  let last = await read();
  let since = Date.now();
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const now = await read();
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= quiet) {
      return;
    }
  }
  throw new Error('value kept changing');
}

/** The id of the window the child button opened. */
async function openChild() {
  await app.getByTestId('window-open-child').click();
  await desktopExpect(app.getByTestId('desktop-child-focus')).toBeVisible();
  const { windows } = await app.listWindows();
  const child = windows.find(window => window.windowId !== 1);
  if (!child) throw new Error('the child window did not open');
  return child.windowId;
}

test('window hooks report focus per window and the window size', async () => {
  await launch();
  await app.setWindowSize(900, 700);
  const { width } = await app.getWindowBounds();
  await poll(async () => (await text('window-width')) === String(width));
  await app.setWindowActive(1, true);
  await poll(async () => (await text('window-focus')) === 'true');
  const child = await openChild();
  expect(await text('desktop-child-width')).toBe('420');
  await app.setWindowActive(child, true);
  await app.setWindowActive(1, false);
  await poll(async () => (await text('desktop-child-focus')) === 'true');
  await poll(async () => (await text('window-focus')) === 'false');
  await app.setWindowActive(1, true);
  await app.setWindowActive(child, false);
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
  // The window reaches its configured width after the first frame.
  await poll(async () => (await text('dimensions-window-width')) === '1024');
  await app.getByTestId('window-open-child').click();
  await desktopExpect(
    app.getByTestId('desktop-child-dimensions-width'),
  ).toBeVisible();
  let childWidth = '';
  try {
    await poll(async () => {
      childWidth = await text('desktop-child-dimensions-width');
      return childWidth === '420';
    }, 15000);
  } catch {
    throw new Error(`child window width was ${JSON.stringify(childWidth)}`);
  }
  expect(await text('dimensions-window-width')).toBe('1024');
});

test('AppState ignores focus moving between app windows', async () => {
  await launch();
  await app.setWindowActive(1, true);
  await poll(async () => (await text('appstate-current')) === 'active');
  await poll(async () => (await text('window-focus')) === 'true');
  await settled(() => text('appstate-log'));
  const before = await text('appstate-log');
  const child = await openChild();
  await app.setWindowActive(child, true);
  await app.setWindowActive(1, false);
  await poll(async () => (await text('desktop-child-focus')) === 'true');
  await poll(async () => (await text('window-focus')) === 'false');
  await settled(() => text('appstate-log'));
  expect(await text('appstate-log')).toBe(before);
});

// The memory warning, alerts, deep links and the share sheet need a visible
// window or the single instance, so they are in apis-onscreen.e2e.ts.

test('AppState is background while no window is visible', async () => {
  await launch();
  await app.setWindowActive(1, true);
  await poll(async () => (await text('appstate-current')) === 'active');
  await app.getByTestId('appstate-hide').click();
  await app.waitForIdle({ ignore: ['timers'] });
  await poll(async () => (await app.windowState(1)).isVisible === false);
  // Hiding a window deactivates it; the simulated activation has to follow.
  await app.setWindowActive(1, false);
  await poll(async () => (await text('appstate-log')).includes('background'));
});

const onMac = process.platform === 'darwin';

describe('Vibration', () => {
  beforeAll(async () => {
    await launch({ height: FITS_SMALL_DISPLAY ?? 768 });
  });

  test('vibrate, a pattern and cancel do not throw', async () => {
    await scrollIntoView(app, 'apis-fixture', 'vibration-run');
    await app.getByTestId('vibration-run').click();
    await poll(async () => (await text('vibration-result')) !== 'none');
    expect(await text('vibration-result')).toBe('ok');
  });
});

describe('Settings', () => {
  async function pressBottom(testID: string) {
    await scrollIntoView(app, 'apis-fixture', testID);
    await app.getByTestId(testID).click();
  }

  test('values persist, and watchKeys fires for changes until cleared', async () => {
    const file = path.resolve('.local/e2e-apis-state.settings.json');
    fs.rmSync(file, { force: true });
    await launch({ height: FITS_SMALL_DISPLAY ?? 768 });
    await pressBottom('settings-save');
    await poll(async () => (await text('settings-result')) !== 'none');
    // The repeated `dark` is no change; the cleared watch hears nothing more.
    expect(await text('settings-result')).toBe('watched:1');
    // Settings.set is a void native call that runs after the press returns;
    // closing the app before the last one is written would lose it.
    await poll(async () => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')).theme === 'light';
      } catch {
        return false;
      }
    });
    await launch({ height: FITS_SMALL_DISPLAY ?? 768 });
    await pressBottom('settings-read');
    await poll(async () => (await text('settings-result')) !== 'none');
    expect(await text('settings-result')).toBe('light:3');
  });
});

describe('Linking', () => {
  beforeAll(async () => {
    await launch();
  });

  test('canOpenURL asks the OS which schemes have a handler', async () => {
    await app.getByTestId('link-can-open').click();
    await poll(async () => (await text('link-result')) !== 'none');
    expect(await text('link-result')).toBe('known:true,unknown:false');
  });

  test.runIf(onMac)(
    'openSettings resolves and opens the settings app',
    async () => {
      const running = () =>
        execFileSync('pgrep', ['-x', 'System Settings'], {
          stdio: ['ignore', 'pipe', 'ignore'],
        }).length > 0;
      const wasRunning = (() => {
        try {
          return running();
        } catch {
          return false;
        }
      })();
      await app.getByTestId('link-open-settings').click();
      await poll(async () => (await text('link-result')) === 'settings:opened');
      if (!wasRunning) {
        await poll(async () => {
          try {
            return running();
          } catch {
            return false;
          }
        }, 10000);
        execFileSync('pkill', ['-x', 'System Settings']);
      }
    },
  );
});
