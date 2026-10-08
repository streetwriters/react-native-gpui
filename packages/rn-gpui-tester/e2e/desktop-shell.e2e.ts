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

test('an app menu sets, reads back and fires by accelerator', async () => {
  await launch('DesktopMenuFixture');
  await app.waitForIdle();

  await app.getByTestId('desktop-menu-read').click();
  const described = await textOf('desktop-menu-json');
  expect(described).toContain('tester-increment');
  expect(described).toContain('tester-check');

  // The accelerator is CmdOrCtrl+Shift+K; the driver maps `mod-` to cmd on
  // macOS and ctrl elsewhere.
  await app.press('mod-shift-k');
  await app.waitForIdle();
  expect(await textOf('desktop-menu-count')).toBe('increments: 1');
  expect(await textOf('desktop-menu-last-press')).toBe(
    'last press: tester-increment@1',
  );

  await app.press('mod-shift-k');
  await app.waitForIdle();
  expect(await textOf('desktop-menu-count')).toBe('increments: 2');
});

test('a menu item patch round-trips and the default menu can be restored', async () => {
  await launch('DesktopMenuFixture');
  await app.waitForIdle();

  expect(await textOf('desktop-menu-checked')).toBe('checked: false');
  await app.getByTestId('desktop-menu-update-check').click();
  expect(await textOf('desktop-menu-checked')).toBe('checked: true');

  await app.getByTestId('desktop-menu-reset').click();
  await app.getByTestId('desktop-menu-read').click();
  const described = await textOf('desktop-menu-json');
  // The default menu has whole standard submenus, not the tester's items.
  expect(described).toContain('"userSet":false');
  expect(described).toContain('editMenu');
});

test('the Edit roles copy and paste in a text input', async () => {
  await launch('DesktopMenuFixture');
  await app.waitForIdle();

  const source = app.getByTestId('menu-copy-source');
  await source.click();
  await source.type('hello edit roles');
  expect(await source.textContent()).toBe('hello edit roles');

  // Select all + copy through the menu's accelerators.
  await app.press('mod-a');
  await app.waitForIdle();
  await app.press('mod-c');
  await app.waitForIdle();

  const target = app.getByTestId('menu-paste-target');
  await target.click();
  await app.press('mod-v');
  await app.waitForIdle();
  expect(await target.textContent()).toBe('hello edit roles');
});
