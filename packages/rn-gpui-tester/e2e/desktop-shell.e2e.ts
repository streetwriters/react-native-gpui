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
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
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

/** Read text without waiting for idle (the perf monitor never goes idle). */
async function rawTextOf(testID: string): Promise<string> {
  const [node] = await app.query('testID', testID);
  return String(node?.text ?? '');
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

test('a context menu shows, reports its model and selects an item', async () => {
  await launch('ContextMenuFixture');
  await app.waitForIdle();

  await app.getByTestId('cm-target').rightClick();
  await app.waitForIdle();
  const menu = await app.getContextMenu();
  expect(menu).not.toBeNull();
  const model = JSON.stringify(menu?.items ?? []);
  expect(model).toContain('cm-open');
  expect(model).toContain('Nested item');
  expect(model).toContain('"checked":true');
  expect(model).toContain('"enabled":false');

  expect(await app.selectContextMenuItem('cm-nested')).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: cm-nested');
});

test('a dismissed context menu resolves null', async () => {
  await launch('ContextMenuFixture');
  await app.waitForIdle();
  await app.getByTestId('cm-target').rightClick();
  await app.waitForIdle();
  expect(await app.dismissContextMenu()).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: dismissed');
});

test('the ContextMenuView wrapper and the menu polyfill open menus', async () => {
  await launch('ContextMenuFixture');
  await app.waitForIdle();

  await app.getByTestId('cm-view').rightClick();
  await app.waitForIdle();
  expect(await app.selectContextMenuItem('cm-open')).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: view:cm-open');

  await app.getByTestId('cm-polyfill').rightClick();
  await app.waitForIdle();
  const model = JSON.stringify((await app.getContextMenu())?.items ?? []);
  expect(model).toContain('Poly Open');
  expect(model).toContain('Poly nested');
  // Hidden actions are dropped, disabled ones are kept but disabled.
  expect(model).not.toContain('Hidden');
  expect(model).toContain('"enabled":false');
  expect(await app.selectContextMenuItem('poly-nested')).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: poly:poly-nested');
});

test('the perf monitor toggles and reports its counters', async () => {
  await launch('PerfMonitorFixture');
  await app.waitForIdle();

  // The overlay's JS frame counter is a rAF loop by design, so the app stops
  // being "idle" as soon as it is on. Every step here uses the raw driver, which
  // does not wait for idle.
  const clickTestId = async (testID: string) => {
    const [node] = await app.query('testID', testID);
    if (!node) {
      throw new Error(`no node with testID ${testID}`);
    }
    await app.click(node.tag);
    await app
      .waitForIdle({ ignore: ['timers', 'frames'], timeout: 1500 })
      .catch(() => {});
  };

  expect(await rawTextOf('perf-enabled')).toBe('enabled: false');
  await clickTestId('perf-toggle');
  expect(await rawTextOf('perf-enabled')).toBe('enabled: true');

  // Let the JS frame counter report at least once.
  await new Promise(resolve => setTimeout(resolve, 1200));
  await clickTestId('perf-read');
  const metrics = await rawTextOf('perf-metrics');
  expect(metrics).toContain('"enabled":true');
  expect(metrics).toContain('"uiFps"');
  expect(metrics).toContain('"mountedViews"');
  expect(metrics).toContain('"lastMountMs"');
  expect(metrics).not.toContain('"uiFps":0');

  await clickTestId('perf-toggle');
  expect(await rawTextOf('perf-enabled')).toBe('enabled: false');
});

test('the Dev Menu opens from its accelerator and runs items', async () => {
  await launch('DesktopShellFixture');
  await app.waitForIdle();

  // Cmd+D goes through the same accelerator interceptor as the app menu.
  await app.press('mod-d');
  await app.waitForIdle();
  const opened = await app.getContextMenu();
  const openedItems = JSON.stringify(opened?.items ?? []);
  expect(openedItems).toContain('dev:reload');
  expect(openedItems).toContain('dev:openDevTools');
  expect(openedItems).toContain('Toggle Perf Monitor');
  expect(openedItems).toContain('Fast Refresh');

  expect(await app.selectContextMenuItem('dev:perfMonitor')).toBe(true);
  await app.waitForIdle();
  const metrics = await app.getPerfMonitor();
  expect(metrics.enabled).toBe(true);

  // Choosing it again turns the monitor back off, and the model reflects it.
  await app.showDevMenu();
  const devMenu = await app.getDevMenu();
  const perfItem = (devMenu.items as { id?: string; checked?: boolean }[]).find(
    item => item.id === 'dev:perfMonitor',
  );
  expect(perfItem?.checked).toBe(true);
  expect(await app.selectContextMenuItem('dev:perfMonitor')).toBe(true);
  await app.waitForIdle();
  expect((await app.getPerfMonitor()).enabled).toBe(false);
});

test('DevSettings toggles reach the perf monitor', async () => {
  await launch('PerfMonitorFixture');
  await app.waitForIdle();

  const [enable] = await app.query('testID', 'perf-devdettings-on');
  await app.click(enable.tag);
  await app
    .waitForIdle({ ignore: ['timers', 'frames'], timeout: 1500 })
    .catch(() => {});
  expect((await app.getPerfMonitor()).enabled).toBe(true);

  const [disable] = await app.query('testID', 'perf-devdettings-off');
  await app.click(disable.tag);
  await app
    .waitForIdle({ ignore: ['timers', 'frames'], timeout: 1500 })
    .catch(() => {});
  expect((await app.getPerfMonitor()).enabled).toBe(false);
});
