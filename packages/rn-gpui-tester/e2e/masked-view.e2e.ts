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
      RN_GPUI_MODULE: 'RNGPUITester--masked-view',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('masked-text')).toBeVisible();
});

afterAll(() => app?.close());

async function pixels(id: string) {
  const image = PNG.sync.read(await app.getByTestId(id).screenshot());
  const scale = image.width / 100;
  const at = (x: number, y: number) => {
    const o = (Math.floor(y * scale) * image.width + Math.floor(x * scale)) * 4;
    return [image.data[o], image.data[o + 1], image.data[o + 2]];
  };
  return { image, at };
}

const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60;
const isWhite = ([r, g, b]: number[]) => r > 245 && g > 245 && b > 245;

test('a text mask shows the content only inside the glyphs', async () => {
  const { image } = await pixels('masked-text');
  let red = 0;
  let white = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const pixel = [image.data[i], image.data[i + 1], image.data[i + 2]];
    if (isRed(pixel)) red++;
    if (isWhite(pixel)) white++;
  }
  const total = image.width * image.height;
  expect(red).toBeGreaterThan(total * 0.02);
  expect(red).toBeLessThan(total * 0.4);
  expect(white).toBeGreaterThan(total * 0.5);
  expect(red + white).toBeGreaterThan(total * 0.9);
});

test('a half-transparent mask halves the content alpha', async () => {
  const { at } = await pixels('masked-half');
  const [r, g, b] = at(50, 50);
  expect(r).toBeGreaterThan(240);
  expect(Math.abs(g - 128)).toBeLessThan(12);
  expect(Math.abs(b - 128)).toBeLessThan(12);
});

test('content outside the mask is not shown', async () => {
  const { at } = await pixels('masked-partial');
  expect(isRed(at(25, 25))).toBe(true);
  expect(isWhite(at(75, 75))).toBe(true);
  expect(isWhite(at(75, 25))).toBe(true);
});
