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
      RN_GPUI_MODULE: 'RNGPUITester--gradient-snap',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 700);
  await desktopExpect(app.getByTestId('repeat-linear')).toBeVisible();
});

afterAll(() => app?.close());

const at = (image: PNG, x: number, y: number) => {
  const index = (y * image.width + x) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
};
const isRed = ([r, , b]: number[]) => r > 200 && b < 60;
const isBlue = ([r, , b]: number[]) => b > 200 && r < 60;

async function shot(testID: string) {
  return PNG.sync.read(await app.getByTestId(testID).screenshot());
}

test('repeating-linear-gradient repeats its stops along the line', async () => {
  const image = await shot('repeat-linear');
  const scale = image.width / 100;
  const sample = (x: number) =>
    at(image, Math.round(x * scale), image.height >> 1);
  expect(isRed(sample(5))).toBe(true);
  expect(isBlue(sample(15))).toBe(true);
  expect(isRed(sample(25))).toBe(true);
  expect(isBlue(sample(55))).toBe(true);
  expect(isBlue(sample(95))).toBe(true);
});

test('repeating-radial-gradient repeats its rings around the centre', async () => {
  const image = await shot('repeat-radial');
  const scale = image.width / 100;
  const sample = (radius: number) =>
    at(image, Math.round((50 + radius) * scale), Math.round(50 * scale));
  expect(isRed(sample(5))).toBe(true);
  expect(isBlue(sample(15))).toBe(true);
  expect(isRed(sample(25))).toBe(true);
  expect(isBlue(sample(35))).toBe(true);
});

test('a repeating layer can be combined with a plain one', async () => {
  const image = await shot('repeat-mixed');
  const scale = image.width / 100;
  expect(isRed(at(image, Math.round(5 * scale), image.height >> 1))).toBe(true);
  expect(isBlue(at(image, Math.round(15 * scale), image.height >> 1))).toBe(
    true,
  );
});

test('snapToOffsets rests on the nearest listed offset', async () => {
  const tag = (await app.query('testID', 'snap-offsets', true))[0].tag;
  await app.scroll(tag, 0, -130, 1, 'started');
  await app.scroll(tag, 0, 0, 1, 'ended');
  await desktopExpect(app.getByTestId('snap-offsets-y')).toHaveText('100');
  await app.scroll(tag, 0, -220, 1, 'started');
  await app.scroll(tag, 0, 0, 1, 'ended');
  await desktopExpect(app.getByTestId('snap-offsets-y')).toHaveText('350');
});

test('a sideways trackpad swipe scrolls a horizontal scroll view and pagingEnabled rests on a page', async () => {
  const tag = (await app.query('testID', 'snap-pages', true))[0].tag;
  await app.scroll(tag, -130, 0, 1, 'started');
  await app.scroll(tag, 0, 0, 1, 'ended');
  await desktopExpect(app.getByTestId('snap-pages-x')).toHaveText('200');
  await app.scroll(tag, 40, 0, 1, 'started');
  await app.scroll(tag, 0, 0, 1, 'ended');
  await desktopExpect(app.getByTestId('snap-pages-x')).toHaveText('200');
  await app.scroll(tag, 160, 0, 1, 'started');
  await app.scroll(tag, 0, 0, 1, 'ended');
  await desktopExpect(app.getByTestId('snap-pages-x')).toHaveText('0');
});

test('a vertical wheel scrolls a horizontal scroll view only with shift held', async () => {
  const tag = (await app.query('testID', 'snap-pages', true))[0].tag;
  await app.scroll(tag, 0, -130, 1, 'started');
  await app.scroll(tag, 0, 0, 1, 'ended');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('snap-pages-x')).toHaveText('0');
  const shift = { modifiers: { shift: true } };
  await app.scroll(tag, 0, -130, 1, 'started', 0, shift);
  await app.scroll(tag, 0, 0, 1, 'ended', 0, shift);
  await desktopExpect(app.getByTestId('snap-pages-x')).toHaveText('200');
  await app.scroll(tag, 0, 160, 1, 'started', 0, shift);
  await app.scroll(tag, 0, 0, 1, 'ended', 0, shift);
  await desktopExpect(app.getByTestId('snap-pages-x')).toHaveText('0');
});

test('a vertical scroll view inside a horizontal one takes the vertical axis and leaves the sideways one to the outer', async () => {
  const inner = (await app.query('testID', 'nest-inner', true))[0].tag;
  await app.scroll(inner, 0, -50);
  await desktopExpect(app.getByTestId('nest-offsets')).toHaveText('0,50');
  await app.scroll(inner, -60, 0);
  await desktopExpect(app.getByTestId('nest-offsets')).toHaveText('60,50');
});
