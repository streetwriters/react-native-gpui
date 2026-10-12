import path from 'node:path';
import { afterAll, afterEach, beforeEach } from 'vitest';
import type { DesktopApp } from './client.js';

/**
 * Diagnostics the app logs at `ERROR` level that are not application errors.
 *
 * The Windows Direct3D backend probes for the DXGI debug layer at startup and
 * logs "The application requested an operation that depends on an SDK component
 * that is missing or mismatched. (0x887A002D)" at `ERROR` when it is absent,
 * then falls back to a normal device (the very next line is a `WARN` saying
 * DirectX debugging is disabled). The Graphics Tools optional feature provides
 * that layer and a normal machine does not have it, so the message says nothing
 * about the app.
 */
const platformDiagnostics: RegExp[] = [
  /ERROR gpui_windows::directx_devices\b.*0x887A002D/u,
];

export function setupDesktopTests(options: { keepApps?: boolean } = {}) {
  const apps = new Set<DesktopApp>();
  (
    globalThis as typeof globalThis & {
      __RN_GPUI_REGISTER_TEST_APP__?: (app: DesktopApp) => void;
    }
  ).__RN_GPUI_REGISTER_TEST_APP__ = app => {
    for (const pattern of platformDiagnostics) app.allowErrors(pattern);
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
