import path from 'node:path';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

afterAll(async () => {
  await app?.close();
});

test('Typst compiles a note, refuses file reads, reports errors with a line, and the PDF opens in the viewer', async () => {
  const bundle = path.resolve(
    'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
  );
  app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'TypstFixture',
      RN_GPUI_BUNDLE: bundle,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-typst.json'),
    },
    initialProps: {},
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('typst-status')).toBeVisible();
  const text = async (id: string) =>
    (await app.query('testID', id, true))[0]?.text ?? '';
  const deadline = Date.now() + 15000;
  while (
    Date.now() < deadline &&
    !/^compiled 1 pages/u.test(await text('typst-status'))
  ) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  expect(await text('typst-status')).toBe('compiled 1 pages');
  while (Date.now() < deadline && (await text('typst-errors')) === '') {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const [denied, broken] = (await text('typst-errors')).split(' | ');
  expect(denied).toMatch(/^ERR_TYPST 2 .*access denied/u);
  expect(broken).toMatch(/^ERR_TYPST 2 /u);
  await desktopExpect(app.getByTestId('pdf-page-1')).toBeVisible();
});
