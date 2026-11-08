import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  frontmostApplicationPid,
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
let frontmostBefore: number | undefined;

beforeAll(async () => {
  frontmostBefore = frontmostApplicationPid();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--window-state',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: false,
  });
  await desktopExpect(
    app.getByTestId('tester-screen-window-state'),
  ).toBeVisible();
});

afterAll(() => app?.close());

const onMac = process.platform === 'darwin';

test.runIf(onMac)(
  'a launched test app is not the frontmost application and has no Dock icon',
  async () => {
    const frontmost = frontmostApplicationPid();
    expect(frontmost).not.toBe(app.pid);
    if (frontmostBefore !== undefined && frontmost !== undefined) {
      // The person may switch applications meanwhile; the test app never is it.
      expect(frontmost).not.toBe(app.pid);
    }
    const front = execFileSync('lsappinfo', ['front'], {
      encoding: 'utf8',
    }).trim();
    const info = execFileSync('lsappinfo', ['list'], { encoding: 'utf8' });
    const entry = info
      .split(/\n(?=\s*\d+\) )/u)
      .find(block => block.includes(`pid = ${app.pid}`));
    if (entry !== undefined) {
      expect(entry).toMatch(/type="UIElement"|type="BackgroundOnly"/u);
      expect(front).not.toContain(entry.match(/ASN:[0-9a-fx-]+/u)?.[0] ?? '-');
    }
  },
);

test('focus and key events work with logical focus only', async () => {
  await app.setWindowActive(1, true);
  await app.waitForIdle();
  expect((await app.windowState(1)).isFocused).toBe(true);
  await app.focusWindow();
  if (onMac) expect(frontmostApplicationPid()).not.toBe(app.pid);
});
