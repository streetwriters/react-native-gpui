import path from 'node:path';
import { PNG } from 'pngjs';
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
      RN_GPUI_MODULE: 'RNGPUITester--opacity-group',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-opacity-group'),
  ).toBeVisible();
});

afterAll(() => app?.close());

/** Pixels that are red over white at the given opacity: 50% is a green of 128, 25% one of 191. */
async function faded(id: string, opacity = 0.5) {
  const image = PNG.sync.read(await app.getByTestId(id).screenshot());
  const green = 255 * (1 - opacity);
  let count = 0;
  for (let at = 0; at < image.data.length; at += 4) {
    const [r, g, b] = [image.data[at], image.data[at + 1], image.data[at + 2]];
    if (r > 240 && Math.abs(g - green) < 30 && Math.abs(g - b) < 6) count += 1;
  }
  return count;
}

test.each([
  'opacity-plain',
  'opacity-sized',
  'opacity-absolute-child',
  'opacity-absolute',
  'opacity-rounded',
  'opacity-pressable',
])('%s draws its child at half strength', async id => {
  expect(await faded(id)).toBeGreaterThan(200);
});

test('opacity-nested multiplies the two fades: a quarter strength', async () => {
  expect(await faded('opacity-nested', 0.25)).toBeGreaterThan(200);
  expect(await faded('opacity-nested')).toBe(0);
});
