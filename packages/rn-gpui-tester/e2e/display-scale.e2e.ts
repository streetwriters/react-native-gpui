import path from 'node:path';
import { PNG } from 'pngjs';
import { expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

async function capture(display: string, offscreen: boolean) {
  const app: DesktopApp = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--text-raster',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_TEST_DISPLAY: display,
    },
    disableAnimations: true,
    offscreen,
  });
  try {
    await app.setWindowSize(1024, 768);
    await desktopExpect(
      app.getByTestId('tester-screen-text-raster'),
    ).toBeVisible();
    await app.waitForIdle();
    const state = await app.windowState(1);
    const shot = await app.getByTestId('raster-description').screenshot();
    const [node] = await app.query('testID', 'raster-description', true);
    return { state, shot, frame: node.frame, window: await app.screenshot() };
  } finally {
    await app.close();
  }
}

for (const offscreen of [false, true]) {
  test(`${offscreen ? 'a hidden window' : 'a window'} renders at 2x, with the same pixels, on the main and the secondary display`, async ({
    skip,
  }) => {
    const main = await capture('main', offscreen);
    const secondary = await capture('secondary', offscreen);
    // Without the gpui-fast scale override a window keeps its display's scale.
    if (secondary.state.scaleFactor !== 2) skip();
    expect(main.state.scaleFactor).toBe(2);
    expect(secondary.state.scaleFactor).toBe(2);
    const image = PNG.sync.read(secondary.shot);
    expect(image.width).toBe(secondary.frame.width * 2);
    expect(secondary.shot.equals(main.shot)).toBe(true);
    expect(secondary.window.equals(main.window)).toBe(true);
  });
}
