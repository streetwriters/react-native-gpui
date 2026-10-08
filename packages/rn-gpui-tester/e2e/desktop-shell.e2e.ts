import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * Desktop shell e2e (plan 7.1–7.6, verification §12.1).
 *
 * The window tests run against the real app: `DesktopWindow.open` opens a real
 * GPUI window with its own React surface, and the fixture reports what JS sees.
 */
let app: DesktopApp;

async function launch(
  module: string,
  scenario?: string,
  initialProps: Record<string, unknown> = {},
) {
  if (app) await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: module,
      RN_GPUI_BUNDLE: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve(
        `.local/e2e-${module}-${scenario ?? 'default'}.json`,
      ),
    },
    initialProps: { scenario, ...initialProps },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  return app;
}

async function textOf(testID: string): Promise<string> {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

afterAll(async () => {
  app?.disconnect();
});

test('the desktop bridge reports capabilities and app info', async () => {
  await launch('DesktopShellFixture');
  await app.waitForIdle();
  expect(await textOf('desktop-capabilities')).toContain('nativeAppMenu');
  expect(await textOf('desktop-capabilities')).toContain('tray');
  expect(await textOf('desktop-info')).toMatch(
    /app\.getInfo: (macos|windows|linux)\//,
  );
});

test('a second window opens with its own surface and closes again', async () => {
  await launch('WindowControlFixture');
  await app.waitForIdle();

  // The fixture runs in the main window, which is always window 1.
  expect(await textOf('desktop-window-id')).toBe('this window: 1');
  expect(await textOf('desktop-window-count')).toBe('open windows: 1');

  await app.getByTestId('desktop-open-window').click();
  expect(await textOf('desktop-window-count')).toBe('open windows: 2');
  expect(await textOf('desktop-window-list')).toContain('DesktopShellChild');

  await app.getByTestId('desktop-close-window').click();
  expect(await textOf('desktop-window-count')).toBe('open windows: 1');
});

test('window state reports the live bounds', async () => {
  await launch('WindowControlFixture');
  await app.waitForIdle();
  await app.getByTestId('desktop-read-state').click();
  const state = await textOf('desktop-window-state');
  expect(state).toContain('"windowId":1');
  expect(state).toContain('"bounds"');
  expect(state).toContain('"scaleFactor"');
});

test('a transparent-title-bar window opens with its own window id', async () => {
  await launch('WindowControlFixture');
  await app.waitForIdle();
  await app.getByTestId('desktop-open-titlebar-window').click();
  expect(await textOf('desktop-window-count')).toBe('open windows: 2');
  expect(await textOf('desktop-window-list')).toContain('DesktopShellChild');
});
