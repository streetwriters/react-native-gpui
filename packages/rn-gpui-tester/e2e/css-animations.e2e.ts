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
      RN_GPUI_MODULE: 'RNGPUITester--css-animations',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: false,
    idleOptions: { ignore: ['animations'] },
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-css-animations'),
  ).toBeVisible();
});

afterAll(() => app?.close());

/** The mean of the red channel: white is 255 and the green is 0. */
async function red(id: string) {
  const image = PNG.sync.read(
    await app.getByTestId(`${id}-parent`).screenshot(),
  );
  let sum = 0;
  for (let at = 0; at < image.data.length; at += 4) sum += image.data[at];
  return sum / (image.data.length / 4);
}

const IDS = [
  'css-transition-opacity',
  'css-transition-color',
  'css-transition-transform',
  'css-animation-opacity',
  'css-animation-color',
  'css-animation-transform',
];

test('CSS transitions and animations change what is painted over time', async () => {
  const start: Record<string, number> = {};
  for (const id of IDS) start[id] = await red(id);
  await app.getByTestId('css-flip').click();
  const middle: Record<string, number> = {};
  await new Promise(resolve => setTimeout(resolve, 700));
  for (const id of IDS) middle[id] = await red(id);
  await new Promise(resolve => setTimeout(resolve, 2200));
  const end: Record<string, number> = {};
  for (const id of IDS) end[id] = await red(id);
  for (const id of IDS) {
    expect(middle[id], `${id} mid-sample`).toBeLessThan(start[id] - 1);
    expect(middle[id], `${id} mid-sample`).toBeGreaterThan(end[id] + 1);
    expect(end[id], `${id} ends`).toBeLessThan(10);
  }
});
