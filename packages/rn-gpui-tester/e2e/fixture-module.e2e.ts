import path from 'node:path';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

async function launch() {
  if (app) await app.close();
  const bundle = path.resolve(
    'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
  );
  app = await launchApp({
    bundle,
    env: {
      RN_GPUI_MODULE: 'FixtureModuleProbeFixture',
      RN_GPUI_BUNDLE: bundle,
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(
        '.local/e2e-fixture-module-default.json',
      ),
    },
    initialProps: {},
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  return app;
}

afterAll(async () => {
  app?.disconnect();
});

async function reported(testId: string) {
  const match = (await app.query('testID', testId, true))[0];
  if (!match?.text) return -1;
  return Number(match.text.replace(/[^0-9]/gu, ''));
}

async function poll(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
  }
  throw new Error('the module probe never reported activity');
}

test('a module-only component paints and its frame callback runs', async () => {
  await launch();
  await desktopExpect(app.getByTestId('fixture-badge')).toBeVisible();
  await desktopExpect(
    app.getByTestId('fixture-badge-frame-ticks'),
  ).toBeVisible();

  await poll(async () => (await reported('fixture-badge-prop-reads')) > 0);
  await poll(async () => (await reported('fixture-badge-frame-ticks')) > 0);
});
