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
      RN_GPUI_MODULE: 'PopupFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 700);
  await desktopExpect(app.getByTestId('popup-fabric')).toBeVisible();
});

afterAll(() => app?.close());

/** The rows of the screenshot that hold red pixels, in window points. */
const redRows = async () => {
  const png = PNG.sync.read(await app.screenshot());
  const scale = png.width / 600;
  const rows = new Set<number>();
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const at = (y * png.width + x) * 4;
      if (
        png.data[at] > 200 &&
        png.data[at + 1] < 60 &&
        png.data[at + 2] < 60
      ) {
        rows.add(Math.round(y / scale));
        break;
      }
    }
  }
  return [...rows];
};

test('an anchored popup of a host component paints above the tree, as a Fabric node and in a native tree, with its default prop', async () => {
  const rows = await redRows();
  expect(rows.some(row => row >= 150 && row < 210)).toBe(true);
  expect(rows.some(row => row >= 400 && row < 460)).toBe(true);
});
