import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

// This spec puts a visible window on screen, so it runs with the serial specs
// (see vitest.e2e.config.ts). The rest of the desktop shell runs offscreen.

let app: DesktopApp;

afterAll(async () => {
  app?.disconnect();
});

async function textOf(testID: string): Promise<string> {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

// The app-menu tests in desktop-shell.e2e.ts fire an accelerator, which goes
// through `handle_accelerator` and never touches the native menu. Windows builds
// a real Win32 menu bar through muda, and until the ids were wired it had none:
// every item was created with no id and its action was not recorded anywhere,
// so a click on the menu bar did nothing at all. This test reads that menu bar
// and activates an item the way Windows does — by sending the `WM_COMMAND` a
// selection produces — so it fails if an item is unwired again.
//
// Only Windows: the native bar this exercises is the Win32 one.
test.skipIf(process.platform !== 'win32')(
  'clicking a native menu bar item runs its action',
  async () => {
    // A visible window: an unmapped one has no menu bar for Windows to build.
    app = await launchApp({
      bundle: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      env: {
        RN_GPUI_MODULE: 'DesktopMenuFixture',
        RN_GPUI_BUNDLE: path.resolve(
          'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
        ),
        RN_GPUI_DEV_PORT: '1',
        RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
        RN_GPUI_WINDOW_STATE: path.resolve(
          '.local/e2e-DesktopMenuFixture-default.json',
        ),
      },
      initialProps: {},
      disableAnimations: true,
      idleOptions: { ignore: ['timers'] },
      offscreen: false,
    });
    await app.setWindowSize(1024, 768);
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
