import fs from 'node:fs';
import path from 'node:path';
import { launchApp, expect as desktopExpect } from '@react-native-gpui/testing';

test('isolates a worker app and captures its hidden window', async () => {
  const worker = process.env.VITEST_POOL_ID ?? '1';
  const started = Date.now();
  const app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    disableAnimations: true,
    offscreen: true,
    env: {
      RN_GPUI_MODULE: 'NavigationFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(`.local/worker-${worker}.json`),
    },
  });
  const firstIdleMs = Date.now() - started;
  await app.getByTestId('e2e-text-input').type(`worker-${worker}`);
  await desktopExpect(app.getByTestId('e2e-text-input')).toHaveValue(
    `worker-${worker}`,
  );
  // gpui_linux maps test windows even under `show: false`, so the hidden
  // window state is only observable where the platform honors it (macOS).
  if (process.platform === 'darwin') {
    expect((await app.getWindowBounds()).hidden).toBe(
      process.env.RN_GPUI_TEST_HEADED !== '1',
    );
  }
  // Capture runs only where the backend implements `render_to_image`;
  // worker isolation, input and the hidden window still run everywhere.
  if (app.captureSupported) {
    const screenshot = await app.screenshot();
    expect(screenshot.length).toBeGreaterThan(1000);
  }
  fs.mkdirSync('.local/worker-results', { recursive: true });
  fs.writeFileSync(
    `.local/worker-results/${worker}-${process.env.GPUI_WORKER_CASE ?? 'default'}.json`,
    JSON.stringify({ worker, pid: app.pid, firstIdleMs }),
  );
});
