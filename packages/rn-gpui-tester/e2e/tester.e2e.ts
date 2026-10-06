import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';
let app: DesktopApp;
async function launch(screen?: string) {
  if (app) await app.close();
  app = await launchApp({
    bundle: path.resolve('packages/rn-gpui-tester/desktop/build/index.bundle'),
    env: {
      RN_GPUI_MODULE: screen ? `RNGPUITester--${screen}` : 'RNGPUITester',
      RN_GPUI_DEV_PORT: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1280, 900);
}
afterAll(() => app?.disconnect());
test('default tester screen has a menu and switches to text', async () => {
  await launch();
  await desktopExpect(app.getByTestId('tester-menu')).toBeVisible();
  await desktopExpect(app.getByTestId('tester-overview')).toBeVisible();
  await app.getByTestId('tester-menu-text').click();
  await desktopExpect(app.getByTestId('tester-screen-text')).toBeVisible();
});
for (const [screen, result] of [
  ['rust-turbomodule', 'Autolinked Rust'],
  ['cpp-turbomodule', 'C++'],
] as const) {
  test(`${screen} starts directly and returns a native result`, async () => {
    await launch(screen);
    await desktopExpect(
      app.getByTestId(`tester-screen-${screen}`),
    ).toBeVisible();
    await app.getByTestId('native-module-run').click();
    const nodes = await app.query('testID', 'native-module-result', true);
    expect(JSON.stringify(nodes)).toContain(result);
  });
}
test('custom Fabric component renders inside the tester', async () => {
  await launch('gpui-component');
  await desktopExpect(
    app.getByTestId('tester-screen-gpui-component'),
  ).toBeVisible();
});
test.skipIf(process.platform !== 'darwin')(
  'Node-API addon handles synchronous and asynchronous calls',
  async () => {
    await launch('node-api');
    await app.getByTestId('native-module-run').click();
    await app.waitForIdle();
    const nodes = await app.query('testID', 'native-module-result', true);
    expect(JSON.stringify(nodes)).toContain('42 / 42');
  },
);
