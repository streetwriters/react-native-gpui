import path from 'node:path';
import { PNG } from 'pngjs';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

async function launch() {
  const bundle = path.resolve(
    'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
  );
  app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'PdfTileFixture',
      RN_GPUI_BUNDLE: bundle,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-pdf-default.json'),
    },
    initialProps: {},
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
}

afterAll(async () => {
  await app?.close();
});

test('a page tile is rendered natively and painted by PdfTile', async () => {
  await launch();
  await desktopExpect(app.getByTestId('pdf-tile')).toBeVisible();
  const info = (await app.query('testID', 'pdf-tile-info', true))[0];
  expect(info.text).toMatch(/^tile \d+ 400x200$/u);

  const png = PNG.sync.read(await app.getByTestId('pdf-tile').screenshot());
  const pixel = (x: number, y: number) => {
    const at =
      (Math.floor(y * png.height) * png.width + Math.floor(x * png.width)) * 4;
    return [png.data[at], png.data[at + 1], png.data[at + 2]];
  };
  expect(pixel(0.25, 0.5)).toEqual([0, 0, 0]);
  expect(pixel(0.75, 0.5)).toEqual([255, 0, 0]);
});
