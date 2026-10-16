import path from 'node:path';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

// Phase C's proof: the `FixtureBadge` component and its probe come from
// `packages/rn-gpui-tester/fixture-component-module`, a crate and a codegen
// package that `packages/core` never names. If this passes, a component can be
// added without touching core.
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

/** The number a probe label reports, or -1 while the screen is still starting. */
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
  // The badge is painted by the module's ComponentRenderer, from the props its
  // C++ half extracted: core painted nothing for this component name.
  await desktopExpect(app.getByTestId('fixture-badge')).toBeVisible();
  await desktopExpect(
    app.getByTestId('fixture-badge-frame-ticks'),
  ).toBeVisible();

  // The module's own renderer painted the badge, so the element carries no
  // React Native text; the prop read counter below is what proves the props
  // reached it.

  // Both counters come from the module's own TurboModule, so a non-zero reading
  // cannot be core's: one counts renders, the other frame-callback ticks.
  await poll(async () => (await reported('fixture-badge-prop-reads')) > 0);
  await poll(async () => (await reported('fixture-badge-frame-ticks')) > 0);
});
