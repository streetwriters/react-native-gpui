import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

let app: DesktopApp;

async function launch(
  module: string,
  scenario?: string,
  initialProps: Record<string, unknown> = {},
  extraEnv: Record<string, string> = {},
  // A Win32 menu bar only exists for a mapped window, so the test that reads the
  // real menu has to ask for a visible one. Everything else stays offscreen.
  { offscreen = true }: { offscreen?: boolean } = {},
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
      ...extraEnv,
    },
    initialProps: { scenario, ...initialProps },
    disableAnimations: true,
    offscreen,
  });
  await app.setWindowSize(1024, 768);
  return app;
}

async function textOf(testID: string): Promise<string> {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

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

// Linux only: this guards the X11 map-state tracking in gpui_linux. On macOS
// `show()`/`hide()` call orderFront/orderOut inside an App update, AppKit calls
// back into GPUI synchronously, and GPUI logs "RefCell already borrowed"; that
// is a separate macOS issue in desktop/platform_window.rs.
test.skipIf(process.platform !== 'linux')(
  'resizing a hidden window keeps its size when shown again',
  async () => {
    await launch('WindowControlFixture');
    await app.waitForIdle();
    await app.setWindowSize(700, 500);

    // Show first so the following hide is a real mapped -> unmapped transition
    // (offscreen test windows start hidden). The window manager reports the new
    // map state asynchronously, hence the idle waits.
    await app.getByTestId('desktop-show-window').click();
    await app.waitForIdle();
    expect((await app.getWindowBounds()).hidden).toBe(false);

    await app.getByTestId('desktop-hide-window').click();
    await app.waitForIdle();
    expect((await app.getWindowBounds()).hidden).toBe(true);

    await app.setWindowSize(500, 400);
    expect(await app.getWindowSize()).toEqual({ width: 500, height: 400 });

    await app.getByTestId('desktop-show-window').click();
    await app.waitForIdle();
    expect((await app.getWindowBounds()).hidden).toBe(false);
    expect(await app.getWindowSize()).toEqual({ width: 500, height: 400 });
  },
);

test('a transparent-title-bar window opens with its own window id', async () => {
  await launch('WindowControlFixture');
  await app.waitForIdle();
  await app.getByTestId('desktop-open-titlebar-window').click();
  expect(await textOf('desktop-window-count')).toBe('open windows: 2');
  expect(await textOf('desktop-window-list')).toContain('DesktopShellChild');
});

test('the caption buttons are the native WindowControl component', async () => {
  // `desktopWindowControl` is gone: caption buttons are a component now, so they
  // are real nodes with test ids rather than an attribute on a `View`. Rendering
  // them at all proves the hand-written descriptor and props reader are wired —
  // a missing descriptor makes Fabric fail the whole surface, not just the button.
  await launch('WindowControlFixture');
  await app.waitForIdle();
  await app.getByTestId('desktop-open-titlebar-window').click();
  await app.waitForIdle();
  expect(await textOf('desktop-window-count')).toBe('open windows: 2');

  // Each must resolve, which it can only do if the component rendered.
  for (const action of ['minimize', 'maximize', 'close']) {
    const button = app.getByTestId(`titlebar-${action}`);
    expect(await button.count()).toBe(1);
  }

  // Rendering alone would pass with a descriptor and no props reader. The probe
  // label is written by JS from `onControlStateChange`, so it only changes when
  // the props reached the Rust renderer and the event came back.
  expect(await textOf('wc-state')).toBe(
    'wc hovered=false pressed=false maximized=false',
  );
  // Hover is not asserted here: the sample never reaches the listener under the
  // test driver, and that is unresolved (see the plan's "Hover" note). The
  // native path is covered by `pointer_area::hover_tests` instead.
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

test('a right click on a child both reports the pointer event and opens the parent menu', async () => {
  // The regression this guards: a child that takes pointer input used to stop the
  // press before the parent's `onContextMenu` ran, so right-clicking the text
  // inside a menu target opened nothing. One press must do both jobs.
  await launch('ContextMenuFixture');
  await app.waitForIdle();

  await app.getByTestId('cm-nested-pointer').rightClick();
  await app.waitForIdle();

  // The child's pointer event fired, with the right button and mask.
  expect(await textOf('pointer-history')).toContain(
    'nested-down button=2 mask=2',
  );
  // And the parent's menu is open — not the child's, which has none.
  const menu = await app.getContextMenu();
  expect(menu).not.toBeNull();
  expect(JSON.stringify(menu?.items ?? [])).toContain('cm-open');
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
  expect(model).not.toContain('Hidden');
  expect(model).toContain('"enabled":false');
  expect(await app.selectContextMenuItem('poly-nested')).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: poly:poly-nested');
});

test('a native ContextMenuView opens without telling JS about the press', async () => {
  // The point of section 4: the menu opens from native, so JS never hears about
  // the press — only about the item that was chosen. If `topContextMenu` were
  // dispatched too, an app with an `onContextMenu` handler would open a second,
  // JS-driven menu on top of the native one.
  await launch('ContextMenuFixture');
  await app.waitForIdle();
  expect((await textOf('cm-log')).trim()).toBe('events:');

  await app.getByTestId('cm-view').rightClick();
  await app.waitForIdle();
  expect(await app.getContextMenu()).not.toBeNull();

  // `open` comes from the native component, so the menu really did open without
  // JS. `onContextMenu` also runs afterwards — deliberately, so an app with one
  // handler serves both paths — but it arrives after the menu is up and cannot
  // cancel it, which is the guarantee worth asserting: the open is not the result
  // of the JS handler.
  const log = await textOf('cm-log');
  expect(log).toContain('open');
  expect(log.indexOf('open')).toBeLessThan(log.lastIndexOf('contextMenu'));

  expect(await app.selectContextMenuItem('cm-open')).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: view:cm-open');
  // And the choice reported back through the same path JS could see.
  expect(await textOf('cm-log')).toContain('select:cm-open');
});

test('a disabled ContextMenuView opens nothing and leaves the press to JS', async () => {
  // A disabled view must not claim the press: claiming it and showing no menu
  // would swallow the right click entirely.
  await launch('ContextMenuFixture');
  await app.waitForIdle();

  // `getContextMenu` reports the last menu the fake presenter saw and is never
  // null once anything has been shown, so `shown` is what proves whether *this*
  // press opened one. Its own items are distinctive, so a wrong owner names
  // itself in the failure.
  const before = (await app.getContextMenu())?.shown ?? 0;
  await app.getByTestId('cm-view-disabled').rightClick();
  await app.waitForIdle();
  const after = await app.getContextMenu();
  expect(after?.shown ?? 0).toBe(before);
  expect(JSON.stringify(after?.items ?? [])).not.toContain(
    'cm-should-not-open',
  );
});

test('a nested ContextMenuView opens the inner menu only', async () => {
  // Two native targets, one inside the other. The innermost claims the press and
  // stops propagation, so exactly one menu opens — the inner one.
  await launch('ContextMenuFixture');
  await app.waitForIdle();

  await app.getByTestId('cm-view-inner').rightClick();
  await app.waitForIdle();

  const menu = await app.getContextMenu();
  expect(menu).not.toBeNull();
  const model = JSON.stringify(menu?.items ?? []);
  expect(model).toContain('cm-inner');
  expect(model).not.toContain('cm-outer');
  await app.dismissContextMenu();
});

test('the perf monitor toggles and reports its counters', async () => {
  await launch('PerfMonitorFixture');
  await app.waitForIdle();

  // The overlay keeps the app drawing, so it is never "idle" while it is on:
  // every step here uses the raw driver, which does not wait for idle.
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

  expect((await app.devMenuState()).open).toBe(false);
  await app.press('mod-d');
  await app.waitForIdle();
  const opened = await app.devMenuState();
  expect(opened.open).toBe(true);
  const openedItems = JSON.stringify(opened.items);
  expect(openedItems).toContain('dev:reload');
  expect(openedItems).toContain('dev:openDevTools');
  expect(openedItems).toContain('Toggle Perf Monitor');
  expect(openedItems).toContain('Fast Refresh');

  const idle = { ignore: ['timers', 'frames'] as const, timeout: 1500 };
  await app.devMenuPerform('dev:perfMonitor', idle);
  expect((await app.getPerfMonitor()).enabled).toBe(true);
  const afterToggle = await app.devMenuState();
  const checkedItem = (
    afterToggle.items as { id?: string; checked?: boolean }[]
  ).find(item => item.id === 'dev:perfMonitor');
  expect(checkedItem?.checked).toBe(true);

  await app.devMenuPerform('dev:perfMonitor', idle);
  expect((await app.getPerfMonitor()).enabled).toBe(false);

  await app.closeDevMenu();
  expect((await app.devMenuState()).open).toBe(false);
  await app.press('mod-d');
  await app.waitForIdle();
  expect((await app.devMenuState()).open).toBe(true);
});

test('Developer items in the app menu run on the host', async () => {
  await launch('DesktopShellFixture');
  await app.waitForIdle();

  const idle = { ignore: ['timers', 'frames'] as const, timeout: 1500 };
  await app.triggerMenuItem('dev:perfMonitor');
  await app.waitForIdle(idle).catch(() => {});
  expect((await app.getPerfMonitor()).enabled).toBe(true);
  await app.triggerMenuItem('dev:perfMonitor');
  await app.waitForIdle(idle).catch(() => {});
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

test('a tray icon opens its popover surface and closes it again', async () => {
  await launch('TrayFixture');
  await app.waitForIdle();

  expect(await app.trayState()).toMatchObject({ installed: false });

  await app.getByTestId('tray-install-popover').click();
  await app.waitForIdle();
  const installed = await app.trayState();
  expect(installed.installed).toBe(true);
  expect(installed.id).toBe('tester-tray');
  expect(installed.popover).toBeNull();

  await app.trayClick({ x: 1200, y: 0, width: 24, height: 24 });
  await app.waitForIdle();
  const opened = await app.trayState();
  expect(opened.popover).toBeGreaterThan(0);
  const windows = await app.listWindows();
  const popover = windows.windows.find(
    entry => entry.windowId === opened.popover,
  );
  expect(popover?.role).toBe('trayPopover');
  expect(popover?.component).toBe('TrayPopover');

  await app.trayClick({ x: 1200, y: 0, width: 24, height: 24 });
  await app.waitForIdle();
  expect((await app.trayState()).popover).toBeNull();

  await app.getByTestId('tray-destroy').click();
  await app.waitForIdle();
  expect(await app.trayState()).toMatchObject({ installed: false });
});

test('a tray menu can be replaced and cleared', async () => {
  await launch('TrayFixture');
  await app.waitForIdle();

  await app.getByTestId('tray-install-menu').click();
  await app.waitForIdle();
  expect(await app.trayState()).toMatchObject({
    installed: true,
    hasMenu: true,
  });

  await app.getByTestId('tray-set-menu').click();
  await app.waitForIdle();
  expect(await textOf('tray-state')).toContain('"hasMenu":true');

  // Clearing sends no items at all; a null used to be rejected instead.
  await app.getByTestId('tray-clear-menu').click();
  await app.waitForIdle();
  expect(await textOf('tray-state')).toContain('"hasMenu":false');

  await app.getByTestId('tray-destroy').click();
  await app.waitForIdle();
});

test('a tray menu reports the chosen item', async () => {
  await launch('TrayFixture');
  await app.waitForIdle();

  await app.getByTestId('tray-install-menu').click();
  await app.waitForIdle();
  const state = await app.trayState();
  expect(state.hasMenu).toBe(true);
  expect(JSON.stringify(state.menuItems)).toContain('tray-open');

  await app.trayClick({
    x: 1200,
    y: 0,
    width: 24,
    height: 24,
    button: 'right',
  });
  await app.waitForIdle();
  const menu = await app.getContextMenu();
  expect(JSON.stringify(menu?.items ?? [])).toContain('tray-open');

  expect(await app.selectContextMenuItem('tray-open')).toBe(true);
  await app.waitForIdle();
  expect(await textOf('tray-menu-press')).toBe('menu press: tray-open');

  await app.getByTestId('tray-destroy').click();
  await app.waitForIdle();
});

test('the GPUI-rendered menu path opens, selects and dismisses', async () => {
  await launch(
    'ContextMenuFixture',
    undefined,
    {},
    {
      RN_GPUI_CONTEXT_MENU: 'gpui',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '0',
    },
  );
  await app.waitForIdle();
  expect((await app.contextMenuPresenter()).presenter).toBe('gpui');

  await app.getByTestId('cm-target').rightClick();
  await app.waitForIdle();
  const opened = await app.gpuiMenuState();
  expect(opened.open).toBe(true);
  const items = JSON.stringify(opened.items ?? []);
  expect(items).toContain('cm-open');
  expect(items).toContain('Nested item');
  expect(items).toContain('"checked":true');

  expect(await app.selectGpuiMenuItem('cm-nested')).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: cm-nested');

  await app.getByTestId('cm-target').rightClick();
  await app.waitForIdle();
  expect(await app.dismissGpuiMenu()).toBe(true);
  expect(await textOf('cm-chosen')).toBe('chosen: dismissed');
});

test('the GPUI menu bar renders the app menu and runs an item', async () => {
  await launch(
    'DesktopMenuFixture',
    undefined,
    {},
    {
      RN_GPUI_MENU_BAR: 'gpui',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '0',
    },
  );
  await app.waitForIdle();

  const bar = await app.menuBarState();
  expect(bar.enabled).toBe(true);
  expect(bar.inset).toBeGreaterThan(0);
  expect(bar.titles).toContain('Tester');
  expect(bar.titles).toContain('Edit');
  expect(bar.titles).toContain('Window');

  expect(await app.openMenuBarMenu('Tester')).toBe(true);
  const menu = await app.gpuiMenuState();
  expect(menu.open).toBe(true);
  const items = JSON.stringify(menu.items ?? []);
  expect(items).toContain('tester-increment');
  expect(items).toContain('tester-disabled');
  expect(items).toContain('"enabled":false');

  expect(await app.selectGpuiMenuItem('tester-increment')).toBe(true);
  await app.waitForIdle();
  expect(await textOf('desktop-menu-count')).toContain('increments: 1');

  expect(bar.inset).toBeGreaterThanOrEqual(24);
});

test('the main window vetoes a close until it is forced', async () => {
  await launch('WindowControlFixture');
  await app.waitForIdle();

  // A second window keeps the app alive when the main one closes, which is also
  // the quit policy: closing a window only quits when nothing is left.
  await app.getByTestId('desktop-open-window').click();
  await app.waitForIdle();

  // The fixture subscribes to `closeRequested`, which is what turns
  // interception on. A plain close asks first: the window stays open and JS
  // sees the request.
  await app.windowClose(1, false);
  await app.waitForIdle();
  expect(await textOf('window-close-requests')).toContain('closeRequested: 1');
  expect((await app.listWindows()).windows.some(w => w.windowId === 1)).toBe(
    true,
  );

  await app.windowClose(1, true);
  const remaining = await app.listWindows();
  expect(remaining.windows.some(w => w.windowId === 1)).toBe(false);
  expect(remaining.windows.length).toBeGreaterThan(0);
});

test('a window closed by the platform is removed from the registry', async () => {
  await launch('WindowControlFixture');
  await app.waitForIdle();

  await app.getByTestId('desktop-open-window').click();
  await app.waitForIdle();
  const opened = (await app.listWindows()).windows.find(
    w => w.component === 'DesktopShellChild',
  );
  expect(opened).toBeDefined();

  expect(await app.osCloseWindow(opened!.windowId)).toBe(true);
  const remaining = await app.listWindows();
  expect(remaining.windows.some(w => w.windowId === opened!.windowId)).toBe(
    false,
  );
  expect(remaining.windows.some(w => w.windowId === 1)).toBe(true);
});

test('opening and closing a popup repeatedly logs no errors', async () => {
  await launch(
    'ContextMenuFixture',
    undefined,
    {},
    {
      RN_GPUI_CONTEXT_MENU: 'gpui',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '0',
    },
  );
  await app.waitForIdle();

  // Before the gpui-fast bump a visibility event could arrive after GPUI had
  // removed the popup window, logging `ERROR gpui::window] window not found`.
  // Open and dismiss the GPUI-rendered menu enough times to catch a race
  // between the close and the X11 event.
  for (let i = 0; i < 25; i += 1) {
    await app.getByTestId('cm-target').rightClick();
    expect((await app.gpuiMenuState()).open).toBe(true);
    expect(await app.dismissGpuiMenu()).toBe(true);
  }
  await app.waitForIdle();

  app.assertNoErrors();
});

// The app-menu tests above fire an accelerator, which goes through
// `handle_accelerator` and never touches the native menu. Windows builds a real
// Win32 menu bar through muda, and until the ids were wired it had none: every
// item was created with no id and its action was not recorded anywhere, so a
// click on the menu bar did nothing at all. This test reads that menu bar and
// activates an item the way Windows does — by sending the `WM_COMMAND` a
// selection produces — so it fails if an item is unwired again.
//
// Only Windows: the native bar this exercises is the Win32 one.
test.skipIf(process.platform !== 'win32')(
  'clicking a native menu bar item runs its action',
  async () => {
    // A visible window: an unmapped one has no menu bar for Windows to build.
    await launch('DesktopMenuFixture', undefined, {}, {}, { offscreen: false });
    await app.waitForIdle();
    expect(await textOf('desktop-menu-count')).toBe('increments: 0');

    const pid = app.pid;
    expect(pid).toBeTypeOf('number');
    const script = path.join(__dirname, 'win32-menu.ps1');
    const raw = execFileSync(
      'pwsh',
      [
        '-NoProfile',
        '-File',
        script,
        '-ProcessId',
        String(pid),
        '-InvokeLabel',
        'Increment',
      ],
      { encoding: 'utf8' },
    );

    // Every item on the app's own menu has an id, which is what makes a click
    // routable. Before the fix these were absent and the check below failed.
    const items = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('ITEM|'));
    expect(items.length).toBeGreaterThan(0);
    const increment = items.find(line =>
      line.startsWith('ITEM|Tester|Increment|'),
    );
    expect(increment).toBeDefined();
    expect(increment).toMatch(/\|enabled=1\|/);
    expect(raw).toContain('FIRED|Increment|');

    await app.waitForIdle();
    expect(await textOf('desktop-menu-count')).toBe('increments: 1');
    expect(await textOf('desktop-menu-last-press')).toBe(
      'last press: tester-increment@1',
    );

    // A checked item that is also disabled must be reported disabled: the two
    // flags used to collide, because a checked item was built as a muda
    // `CheckMenuItem` with `enabled` hardcoded true.
    const checkedDisabled = items.find(line =>
      line.startsWith('ITEM|Tester|Checkable Disabled|'),
    );
    expect(checkedDisabled).toBeDefined();
    expect(checkedDisabled).toMatch(/\|enabled=0\|checked=1$/);
  },
);

test('a button inside the title bar receives its press on every platform', async () => {
  // Section 6 item 7. The title bar is a drag region, which on Windows is a
  // `HTCAPTION` window-control area, so the press on a child button used to be
  // taken for a window move: `WM_NCHITTEST` answered with the bar's area because
  // the bar's hitbox is registered before its children paint, and the button
  // never saw a mouse-down. The fix makes the hit-test answer for whichever
  // element is really under the pointer, so this press reaches the button and the
  // window does not move.
  await launch('WindowControlFixture');
  await app.waitForIdle();

  const boundsBefore = await app.getWindowBounds();
  expect(await textOf('titlebar-inner-presses')).toBe('titlebar button: 0');

  await app.getByTestId('titlebar-inner-button').click();
  await app.waitForIdle();

  expect(await textOf('titlebar-inner-presses')).toBe('titlebar button: 1');

  // The press must not also have dragged the window, which is what happened
  // when the whole bar answered `HTCAPTION`.
  const boundsAfter = await app.getWindowBounds();
  expect(boundsAfter.x).toBe(boundsBefore.x);
  expect(boundsAfter.y).toBe(boundsBefore.y);
});

test('pointer events report every button, the mask and the modifiers', async () => {
  // Section 2: `pointer_payload` used to report `button: 0` for every press and
  // no modifiers at all, so a right or middle click was indistinguishable from a
  // left one and a Ctrl+click could not be told apart either.
  await launch('ContextMenuFixture');
  await app.waitForIdle();
  const probe = app.getByTestId('pointer-probe');

  // A left press is button 0 with only the left bit in the mask.
  await probe.click({ button: 'left' });
  await app.waitForIdle();
  // Read from the accumulated history, so the press is visible even though the
  // release replaced the last line.
  expect(await textOf('pointer-history')).toContain(
    'down button=0 mask=1 mods=none',
  );

  // A middle press is button 1 and its mask bit is 4 — the DOM's bit order is
  // not the number order. Both are asserted from the accumulated history: the
  // number alone would pass even if the mask were always zero.
  await probe.click({ button: 'middle' });
  await app.waitForIdle();
  expect(await textOf('pointer-history')).toContain(
    'down button=1 mask=4 mods=none',
  );

  // A right press is button 2 with mask bit 2. The probe has no onContextMenu,
  // so the press reaches the pointer handler rather than opening a menu.
  await probe.click({ button: 'right' });
  await app.waitForIdle();
  expect(await textOf('pointer-history')).toContain(
    'down button=2 mask=2 mods=none',
  );
});

/**
 * Keyboard shortcuts.
 *
 * These are the tests the design depends on, because they exercise the *focus
 * path*: a `ShortcutScope` element contributing its context to the dispatch
 * tree, and a focused `TextInput` contributing `rn-text-input`. The Rust unit
 * tests hand `bindings_for_input` a context vector; only this proves the vector
 * is what a real mounted tree produces.
 */
test('an inner scope overrides the outer scope and the window for one key', async () => {
  await launch(
    'ShortcutsFixture',
    'debug',
    {},
    { RN_GPUI_DEBUG_SHORTCUTS: '1' },
  );
  await app.waitForIdle();

  // `mod+j` is bound at the window level, in the outer scope and in the inner
  // scope. All three are live bindings; only the innermost may run.
  await app.getByTestId('scope-inner-focus').click();
  await app.waitForIdle();
  await app.press('mod-j');
  await app.waitForIdle();

  const log = await textOf('shortcut-log');
  expect(log).toBe('inner:mod+j');
});

test('a shortcut beats a menu accelerator with the same keys', async () => {
  await launch(
    'ShortcutsFixture',
    'debug',
    {},
    { RN_GPUI_DEBUG_SHORTCUTS: '1' },
  );
  await app.waitForIdle();

  // The menu item is CmdOrCtrl+Alt+K, and the inner scope binds the same keys.
  // Before this work the interceptor consumed the key first and the menu item
  // won; the binding is now the outermost context, so the scope beats it.
  expect(await textOf('shortcut-menu-presses')).toBe('menu:0');
  await app.getByTestId('scope-inner-focus').click();
  await app.waitForIdle();
  await app.press('mod-alt-k');
  await app.waitForIdle();

  expect(await textOf('shortcut-log')).toBe('inner:mod+alt+k');
  // The menu item did *not* run: the key was consumed before the menu path.
  expect(await textOf('shortcut-menu-presses')).toBe('menu:0');
});

test('a text input keeps its keys unless the shortcut opts in', async () => {
  await launch('ShortcutsFixture');
  await app.waitForIdle();

  // Focus the input inside the inner scope; `mod+a` is bound there, but with
  // `allowInTextInput: false`, so the input's own select-all stays in charge and
  // the shortcut must not run.
  await app.getByTestId('scope-inner-input').click();
  await app.waitForIdle();
  await app.press('mod-a');
  await app.waitForIdle();
  expect(await textOf('shortcut-log')).toBe('');

  // Opting in flips it: the same key now fires the shortcut even with the input
  // focused.
  await app.getByTestId('shortcut-toggle-allow-in-input').click();
  await app.waitForIdle();
  await app.getByTestId('scope-inner-input').click();
  await app.waitForIdle();
  await app.press('mod-a');
  await app.waitForIdle();
  expect(await textOf('shortcut-log')).toBe('select-all');
});

test('a two-key chord fires only after both keys', async () => {
  await launch('ShortcutsFixture');
  await app.waitForIdle();
  await app.getByTestId('scope-inner-focus').click();
  await app.waitForIdle();

  // The first key alone must not fire it, and must not fire anything else.
  await app.press('mod-k');
  await app.waitForIdle();
  expect(await textOf('shortcut-log')).toBe('');

  await app.press('mod-s');
  await app.waitForIdle();
  expect(await textOf('shortcut-log')).toBe('chord');
});

test('a remap moves the binding and the menu label with it', async () => {
  await launch('ShortcutsFixture');
  await app.waitForIdle();

  // The menu label is built from the shortcut's keys, so it is the observable
  // that proves a user keymap reached the registry.
  await app.getByTestId('shortcut-read').click();
  await app.waitForIdle();
  expect(await textOf('shortcut-installed')).toContain(
    'shortcut:mod+shift+p@mod+shift+p',
  );

  await app.getByTestId('shortcut-remap').click();
  await app.waitForIdle();
  expect(await textOf('shortcut-user-keys')).toBe('mod+shift+o');

  // The old keys no longer fire it, and the new ones do — which is only true if
  // the remap rebuilt the keymap rather than just the label.
  await app.press('mod-shift-p');
  await app.waitForIdle();
  expect(await textOf('shortcut-log')).toBe('');

  await app.press('mod-shift-o');
  await app.waitForIdle();
  // Both handlers run: the hook's, and the one attached through
  // `Shortcut.addHandler` to the same id.
  expect(await textOf('shortcut-log')).toBe(
    'window:mod+shift+o,palette:mod+shift+o',
  );
});
