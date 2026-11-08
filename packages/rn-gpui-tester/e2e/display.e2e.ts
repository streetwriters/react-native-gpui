import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(env: Record<string, string>, offscreen: boolean) {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--window-state',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      ...env,
    },
    disableAnimations: true,
    offscreen,
  });
  await desktopExpect(
    app.getByTestId('tester-screen-window-state'),
  ).toBeVisible();
  return app;
}

const inside = (
  bounds: { x: number; y: number; width: number; height: number },
  display: { x: number; y: number; width: number; height: number },
) => {
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;
  return (
    centreX >= display.x &&
    centreX <= display.x + display.width &&
    centreY >= display.y &&
    centreY <= display.y + display.height
  );
};

for (const offscreen of [false, true]) {
  const label = offscreen ? 'a hidden window' : 'a window';
  test(`${label} opens on the secondary display by default, and on the one RN_GPUI_TEST_DISPLAY names`, async () => {
    const probe = await start({}, offscreen);
    const displays = await probe.displays();
    const main = displays.find(display => display.primary)!;
    const secondary = displays.find(display => !display.primary);
    if (secondary === undefined) {
      expect(inside((await probe.windowState(1)).bounds, main.bounds)).toBe(
        true,
      );
      return;
    }
    expect(inside((await probe.windowState(1)).bounds, secondary.bounds)).toBe(
      true,
    );
    await probe.close();

    const onMain = await start({ RN_GPUI_TEST_DISPLAY: 'main' }, offscreen);
    expect(inside((await onMain.windowState(1)).bounds, main.bounds)).toBe(
      true,
    );
    await onMain.close();

    const missing = await start({ RN_GPUI_TEST_DISPLAY: '9' }, offscreen);
    expect(inside((await missing.windowState(1)).bounds, main.bounds)).toBe(
      true,
    );
  });
}
