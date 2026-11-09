import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

const run = promisify(execFile);
const appId = `org.reactnativegpui.tester.app-${process.pid}`;
const env = {
  RN_GPUI_SINGLE_INSTANCE: '1',
  RN_GPUI_APP_ID: appId,
};
let app: DesktopApp;

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    args: ['--first', 'run'],
    env: {
      ...env,
      RN_GPUI_MODULE: 'RNGPUITester--app',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-app')).toBeVisible();
});

afterAll(() => app?.close());

test('idleStatus names the pending timers with their delays', async () => {
  const [button] = await app.query('testID', 'app-timer', true);
  const top = (await app.menuBarState()).inset;
  const at = {
    x: button.frame.x + button.frame.width / 2,
    y: button.frame.y + button.frame.height / 2 + top,
  };
  await app.mouseDown(at);
  await app.mouseUp(at);
  let status = await app.idleStatus();
  for (
    let tries = 0;
    tries < 20 && !status.busySources.some(s => s.source === 'timers');
    tries++
  ) {
    await new Promise(resolve => setTimeout(resolve, 20));
    status = await app.idleStatus();
  }
  const timers = status.busySources.find(source => source.source === 'timers');
  expect(timers?.detail).toMatch(/timer \d+: set for 1400 ms, due in \d+ ms/);
});

test('launchArgs gives the arguments the app was started with', async () => {
  await desktopExpect(app.getByTestId('app-launch-args')).toHaveText(
    '--first run',
  );
});

test('a second launch hands its arguments to the running app and exits', async () => {
  const binary = process.env.RN_GPUI_TEST_BINARY as string;
  const started = Date.now();
  await run(binary, ['new', 'note'], {
    env: { ...process.env, ...env },
    timeout: 20_000,
  });
  expect(Date.now() - started).toBeLessThan(20_000);
  await desktopExpect(app.getByTestId('app-second-instances')).toHaveText(
    'new note',
  );
});

test('the zoom roles step the window zoom and reset it', async () => {
  const zoom = () => app.getByTestId('app-zoom').textContent();
  expect(await zoom()).toBe('1');
  await app.getByTestId('app-zoomIn').click();
  await desktopExpect(app.getByTestId('app-zoom')).toHaveText('1.1');
  await app.getByTestId('app-zoomIn').click();
  await desktopExpect(app.getByTestId('app-zoom')).toHaveText('1.25');
  await app.getByTestId('app-zoomOut').click();
  await desktopExpect(app.getByTestId('app-zoom')).toHaveText('1.1');
  await app.getByTestId('app-resetZoom').click();
  await desktopExpect(app.getByTestId('app-zoom')).toHaveText('1');
});

test.runIf(process.platform === 'darwin')(
  'the Dock menu shows its items and runs the one that is chosen',
  async () => {
    await expect
      .poll(() => app.dockMenu(), { timeout: 5_000 })
      .toEqual(['New note', 'New notebook']);
    await app.pressDockMenuItem(1);
    await desktopExpect(app.getByTestId('app-dock-presses')).toHaveText(
      'notebook',
    );
    await app.pressDockMenuItem(0);
    await desktopExpect(app.getByTestId('app-dock-presses')).toHaveText(
      'notebook,note',
    );
  },
);

test('Tray.onClick reports a click with its button and whether it is a double click', async () => {
  await app.trayInstall({ id: 'app-e2e-tray', tooltip: 'e2e' });
  try {
    const rect = { x: 1200, y: 0, width: 24, height: 24 };
    await app.trayClick(rect);
    await app.trayClick(rect);
    await app.trayClick({ ...rect, button: 'right' });
    await desktopExpect(app.getByTestId('app-tray-clicks')).toHaveText(
      'left:false,left:true,right:false',
    );
  } finally {
    await app.trayDestroy();
  }
});

test('quit ends the application', async () => {
  await app
    .getByTestId('app-quit')
    .click()
    .catch(() => undefined);
  const deadline = Date.now() + 10_000;
  let ended = false;
  while (Date.now() < deadline && !ended) {
    ended = await app.idleStatus().then(
      () => false,
      () => true,
    );
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  expect(ended).toBe(true);
});
