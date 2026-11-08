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
      RN_GPUI_MODULE: 'RNGPUITester--side-borders',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(
    app.getByTestId('tester-screen-side-borders'),
  ).toBeVisible();
});

afterAll(() => app?.close());

async function shot(id: string) {
  const image = PNG.sync.read(await app.getByTestId(id).screenshot());
  const scale = image.width / 100;
  const at = (x: number, y: number) => {
    const o = (Math.round(y * scale) * image.width + Math.round(x * scale)) * 4;
    return [...image.data.subarray(o, o + 3)].join(',');
  };
  return { at, scale };
}

const RED = '255,0,0';
const WHITE = '255,255,255';

for (const id of [
  'border-bottom',
  'border-bottom-solid',
  'border-color-only-bottom-width',
]) {
  test(`${id} paints its bottom edge only`, async () => {
    const { at } = await shot(id);
    expect(at(50, 48)).toBe(RED);
    expect(at(50, 25)).toBe(WHITE);
    expect(at(50, 1)).toBe(WHITE);
    expect(at(1, 25)).toBe(WHITE);
  });
}

test('top and left edges have their own widths and colors', async () => {
  const { at } = await shot('border-top-left');
  expect(at(50, 2)).toBe(RED);
  expect(at(50, 6)).toBe(WHITE);
  expect(at(3, 25)).toBe('0,0,255');
  expect(at(10, 25)).toBe(WHITE);
});

test('a right edge paints', async () => {
  const { at } = await shot('border-right');
  expect(at(97, 25)).toBe('0,170,0');
  expect(at(50, 25)).toBe(WHITE);
});

test('a bottom edge paints under a border radius', async () => {
  const { at } = await shot('border-bottom-radius');
  expect(at(50, 48)).toBe(RED);
});

test('a dashed bottom edge has gaps', async () => {
  const { at } = await shot('border-bottom-dashed');
  const row = Array.from({ length: 96 }, (_, x) => at(x + 2, 48));
  expect(row).toContain(RED);
  expect(row).toContain(WHITE);
});

for (const [id, color] of [
  ['border-short-hex', '221,221,221'],
  ['border-rgba', '127,127,127'],
] as const) {
  test(`${id} paints its color`, async () => {
    const { at } = await shot(id);
    expect(at(50, 48)).toBe(color);
  });
}

test('a one pixel bottom edge paints in a row with a transparent left edge', async () => {
  const [node] = await app.query('testID', 'border-flex-gap', true);
  const { at } = await shot('border-flex-gap');
  expect(at(50, node.frame.height - 1)).toBe(RED);
  expect(at(50, node.frame.height - 3)).not.toBe(RED);
});

test('edges paint inside a scroll view and a list', async () => {
  expect((await shot('border-in-scroll')).at(50, 48)).toBe(RED);
  expect((await shot('border-in-list-1')).at(50, 48)).toBe(RED);
});
