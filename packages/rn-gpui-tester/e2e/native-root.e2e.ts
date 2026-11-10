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
      RN_GPUI_MODULE: 'NativeRootFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('native-root')).toBeVisible();
});

afterAll(() => app?.close());

const rgbAt = (image: PNG, x: number, y: number) => {
  const index = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
};

async function swatches() {
  const image = PNG.sync.read(
    await app.getByTestId('native-root').screenshot(),
  );
  const scale = image.width / 240;
  const row = 4 + 30 + 4 + 15;
  return [0, 1, 2].map(index => {
    const [r, g, b] = rgbAt(image, (4 + index * 44 + 20) * scale, row * scale);
    return r > 200 ? 'red' : g > 200 ? 'green' : b > 200 ? 'blue' : 'none';
  });
}

async function press(x: number, y: number) {
  const [root] = await app.query('testID', 'native-root', true);
  const top = (await app.menuBarState()).inset;
  const at = { x: root.frame.x + x, y: root.frame.y + y + top };
  await app.mouseDown(at);
  await app.mouseUp(at);
  await app.waitForIdle();
}

test('a native tree is laid out by gpui inside the box Yoga sized', async () => {
  const [root] = await app.query('testID', 'native-root', true);
  expect(root.frame.width).toBe(240);
  expect(root.frame.height).toBe(120);
  expect(await swatches()).toEqual(['red', 'green', 'blue']);
});

test('a press on a nested native component reaches its handler in React, with the context of the outer tree', async () => {
  await press(20, 14);
  await desktopExpect(app.getByTestId('native-last')).toHaveText(
    'last:pressed blue 1',
  );
  await press(20, 14);
  await desktopExpect(app.getByTestId('native-last')).toHaveText(
    'last:pressed blue 2',
  );
  await press(4 + 20, 4 + 30 + 4 + 15);
  await desktopExpect(app.getByTestId('native-last')).toHaveText('last:red');
});

test('a keyed reorder in React moves the native instances', async () => {
  await app.getByTestId('native-reorder').click();
  await app.waitForIdle();
  expect(await swatches()).toEqual(['blue', 'red', 'green']);
  await press(4 + 20, 4 + 30 + 4 + 15);
  await desktopExpect(app.getByTestId('native-last')).toHaveText('last:blue');
});

test('removing a component from the tree removes its instances', async () => {
  await app.getByTestId('native-unmount').click();
  await app.waitForIdle();
  expect(await swatches()).toEqual(['none', 'none', 'none']);
});
