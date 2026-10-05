import fs from 'node:fs';
import path from 'node:path';
import { launchApp, expect as desktopExpect } from '@react-native-gpui/testing';

test('isolates a worker app and captures its hidden window', async () => {
  const worker = process.env.JEST_WORKER_ID ?? '1';
  const started = Date.now();
  const app = await launchApp({
    disableAnimations: true,
    offscreen: true,
    env: {
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(`.local/worker-${worker}.json`),
    },
  });
  const firstIdleMs = Date.now() - started;
  await app.getByTestId('e2e-text-input').type(`worker-${worker}`);
  await desktopExpect(app.getByTestId('e2e-text-input')).toHaveValue(
    `worker-${worker}`,
  );
  expect((await app.getWindowBounds()).hidden).toBe(true);
  const screenshot = await app.screenshot();
  expect(screenshot.length).toBeGreaterThan(1000);
  fs.mkdirSync('.local/worker-results', { recursive: true });
  fs.writeFileSync(
    `.local/worker-results/${worker}-${process.env.GPUI_WORKER_CASE ?? 'default'}.json`,
    JSON.stringify({ worker, pid: app.pid, firstIdleMs }),
  );
});
