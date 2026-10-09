import path from 'node:path';
import { afterAll, afterEach, beforeEach } from 'vitest';
import type { DesktopApp } from './client.js';

export function setupDesktopTests(options: { keepApps?: boolean } = {}) {
  const apps = new Set<DesktopApp>();
  (
    globalThis as typeof globalThis & {
      __RN_GPUI_REGISTER_TEST_APP__?: (app: DesktopApp) => void;
    }
  ).__RN_GPUI_REGISTER_TEST_APP__ = app => apps.add(app);
  beforeEach(context => {
    context.onTestFailed(async () => {
      const name = context.task.name.replace(/[^a-z0-9_-]/giu, '_');
      await Promise.all(
        [...apps].map((app, index) =>
          app.saveArtifacts(
            path.resolve(
              '.local/test-artifacts',
              `vitest-${process.env.VITEST_POOL_ID ?? '1'}`,
              `${name}-${index}`,
            ),
          ),
        ),
      );
    });
  });
  afterEach(() => {
    for (const app of apps) app.assertNoErrors();
  });
  afterAll(async () => {
    await Promise.all(
      [...apps].map(app => (options.keepApps ? app.disconnect() : app.close())),
    );
    delete (
      globalThis as typeof globalThis & {
        __RN_GPUI_REGISTER_TEST_APP__?: unknown;
      }
    ).__RN_GPUI_REGISTER_TEST_APP__;
  });
}
