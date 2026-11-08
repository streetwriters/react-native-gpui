import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

/** A window-state file of its own, so a launch neither restores nor leaves bounds. */
const freshWindowState = () =>
  path.join(mkdtempSync(path.join(tmpdir(), 'rn-gpui-window-')), 'window.json');

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--window-state',
      RN_GPUI_WINDOW_STATE: freshWindowState(),
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-window-state'),
  ).toBeVisible();
});

afterAll(() => app?.close());

async function poll(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for the condition: ${check}`);
}

const text = (testID: string) => app.getByTestId(testID).textContent();
const run = async (action: string) => {
  await app.getByTestId(`window-action-${action}`).click();
  await app.waitForIdle();
};

test('setTitle updates the title in the window state', async () => {
  await run('title');
  await poll(async () =>
    (await text('window-state')).includes('title=Renamed window'),
  );
});

test('hide and show update isVisible and report a state change', async () => {
  await run('hide');
  await poll(async () =>
    (await text('window-state')).includes('visible=false'),
  );
  await run('show');
  await poll(async () => (await text('window-state')).includes('visible=true'));
});

test('maximize and unmaximize are reflected in the state', async () => {
  await run('maximize');
  await poll(
    async () => (await app.windowState(1)).isMaximized === true,
    10000,
  );
  await poll(async () =>
    (await text('window-state')).includes('maximized=true'),
  );
  await run('unmaximize');
  await poll(
    async () => (await app.windowState(1)).isMaximized === false,
    10000,
  );
});

test('the zoom factor scales layout, painting and pointer input', async () => {
  const width = async () =>
    Number((await text('window-width')).replace('width=', ''));
  const natural = await width();
  const [box] = await app.query('testID', 'zoom-box', true);

  await run('zoom-2');
  await poll(async () => (await text('window-state')).includes('zoom=2'));
  await poll(async () => Math.abs((await width()) - natural / 2) <= 1);

  const [zoomed] = await app.query('testID', 'zoom-box', true);
  const painted = PNG.sync.read(await app.screenshot());
  const pixels = painted.width / 1024;
  const blue = (x: number, y: number) => {
    const at = (y * painted.width + x) * 4;
    const [r, g, b] = painted.data.subarray(at, at + 3);
    return (
      Math.abs(r - 0x3b) < 4 && Math.abs(g - 0x82) < 4 && Math.abs(b - 0xf6) < 4
    );
  };
  const centreX = Math.round(
    (zoomed.frame.x + zoomed.frame.width / 2) * 2 * pixels,
  );
  const centreY = Math.round(
    (zoomed.frame.y + zoomed.frame.height / 2) * 2 * pixels,
  );
  expect(blue(centreX, centreY)).toBe(true);
  let left = centreX;
  let right = centreX;
  while (blue(left - 1, centreY)) left -= 1;
  while (blue(right + 1, centreY)) right += 1;
  expect((right - left + 1) / (box.frame.width * pixels)).toBeCloseTo(2, 1);

  await app.getByTestId('zoom-box').click();
  await poll(async () => (await text('window-presses')) === 'presses=1');

  await run('zoom-1');
  await poll(async () => Math.abs((await width()) - natural) <= 1);
});

test('a window that was minimised and then hidden shows again', async () => {
  // Minimising needs a window the system has put on screen.
  await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--window-state',
      RN_GPUI_WINDOW_STATE: freshWindowState(),
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: false,
    offscreen: false,
  });
  await desktopExpect(
    app.getByTestId('tester-screen-window-state'),
  ).toBeVisible();
  await run('minimize');
  await poll(
    async () => (await text('window-state')).includes('minimized=true'),
    10000,
  );
  await run('hide');
  await poll(async () =>
    (await text('window-state')).includes('visible=false'),
  );
  await run('show-focus');
  await poll(async () => (await text('window-state')).includes('visible=true'));
  await poll(
    async () => (await text('window-state')).includes('minimized=false'),
    10000,
  );
  await app.waitForIdle();
  expect(app.logs.join('\n')).not.toMatch(/already borrowed/);
});
