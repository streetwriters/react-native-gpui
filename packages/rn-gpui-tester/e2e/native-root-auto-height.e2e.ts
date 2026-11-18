import path from 'node:path';
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
      RN_GPUI_MODULE: 'NativeRootAutoHeightFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('auto-root')).toBeVisible();
});

afterAll(() => app?.close());

const height = async (testID: string) =>
  (await app.getByTestId(testID).all())[0].frame.height;

test('a native root without a height is as high as its tree and follows it', async () => {
  await desktopExpect(app.getByTestId('auto-after')).toBeVisible();
  const [before] = await app.getByTestId('auto-after').all();
  expect(await height('auto-root')).toBeCloseTo(20, 0);
  await app.getByTestId('auto-grow').click();
  await app.getByTestId('auto-grow').click();
  await desktopExpect(app.getByTestId('auto-after')).toBeVisible();
  expect(await height('auto-root')).toBeCloseTo(60, 0);
  const [after] = await app.getByTestId('auto-after').all();
  expect(after.frame.y - before.frame.y).toBeCloseTo(40, 0);
});

test('a native root with fitWidth is as wide as its tree and follows it', async () => {
  await desktopExpect(app.getByTestId('fit-root')).toBeVisible();
  const width = async () =>
    (await app.getByTestId('fit-root').all())[0].frame.width;
  const before = await width();
  await app.getByTestId('auto-grow').click();
  await app.waitForIdle();
  expect((await width()) - before).toBeCloseTo(30, 0);
});

test('a fitWidth root with less room shrinks to its min-content width', async () => {
  await desktopExpect(app.getByTestId('fit-narrow')).toBeVisible();
  const [wide] = await app.getByTestId('fit-wide').all();
  const [narrow] = await app.getByTestId('fit-narrow').all();
  expect(wide.frame.width).toBeCloseTo(90, 0);
  expect(narrow.frame.width).toBeCloseTo(30, 0);
  expect(narrow.frame.height).toBeCloseTo(30, 0);
});
