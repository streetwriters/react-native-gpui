import path from 'node:path';
import { afterAll, afterEach, beforeEach } from 'vitest';
import type { DesktopApp } from './client.js';

/**
 * Platform logs that are not test failures. The X11 input layer reports this
 * at error when no pointer device exposes scroll axes (common in VMs, remote
 * sessions and Xvfb); the app falls back to core X11 events, and every event
 * a test dispatches is synthetic anyway. The second entry is gpui closing a
 * window: the X11 visibility event arrives after removal and the callback
 * only syncs state (verified via backtrace through
 * `X11Client::handle_visibility_changed`).
 */
const BENIGN_APP_ERRORS = [
  /Found no xinput mouse pointers/u,
  /ERROR gpui::window\] window not found/u,
];

export function setupDesktopTests(options: { keepApps?: boolean } = {}) {
  const apps = new Set<DesktopApp>();
  (
    globalThis as typeof globalThis & {
      __RN_GPUI_REGISTER_TEST_APP__?: (app: DesktopApp) => void;
    }
  ).__RN_GPUI_REGISTER_TEST_APP__ = app => {
    for (const pattern of BENIGN_APP_ERRORS) app.allowErrors(pattern);
    apps.add(app);
  };
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
