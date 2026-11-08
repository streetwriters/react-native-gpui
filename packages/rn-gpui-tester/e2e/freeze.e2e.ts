import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

beforeAll(async () => {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'RNGPUITester--freeze',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
      RN_GPUI_DEBUG_JS_TASKS: '1',
    },
    disableAnimations: false,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-freeze')).toBeVisible();
});

afterAll(() => app?.close());

test('the app settles after moving through several frozen routes', async () => {
  for (const route of ['notebook', 'tag', 'home', 'notebook', 'home']) {
    await app.getByTestId(`go-${route}`).click();
    await app.waitForIdle({ timeout: 8000 });
  }
  await app.getByTestId('route-home-bump').click();
  await app.waitForIdle({ timeout: 8000 });
  expect(await app.getByTestId('route-home-title').textContent()).toMatch(
    /^home 1 /,
  );
});

test('with RN_GPUI_DEBUG_JS_TASKS the idle probe names the JS task that is running', async () => {
  await desktopExpect(app.getByTestId('js-busy')).toBeVisible();
  const pressed = app.getByTestId('js-busy').click();
  const failure = pressed.then(
    () => undefined,
    (error: unknown) => error,
  );
  let status = '';
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !status.includes('running for')) {
    await new Promise(resolve => setTimeout(resolve, 50));
    status = JSON.stringify(await app.idleStatus());
  }
  expect(
    await Promise.race([failure, Promise.resolve(undefined)]),
  ).toBeUndefined();
  expect(status).toContain('running for');
  expect(status).toContain('queued from');
  await pressed;
  await app.waitForIdle({ timeout: 8000 });
});

for (const name of ['activity', 'freeze']) {
  test(`${name}: a list keeps its key handling after being hidden and shown again`, async () => {
    const text = (id: string) => app.getByTestId(id).textContent();
    await app.getByTestId(`${name}-row`).click();
    await app.waitForIdle();
    await app.press('down');
    await app.waitForIdle();
    expect(await text(`${name}-keys`)).toBe('1');
    await app.getByTestId('hide-toggle').click();
    await app.waitForIdle();
    await app.getByTestId('hide-toggle').click();
    await app.waitForIdle();
    await app.getByTestId(`${name}-row`).click();
    await app.waitForIdle();
    expect(await text(`${name}-presses`)).toBe('2');
    await app.press('down');
    await app.waitForIdle();
    expect(await text(`${name}-keys`)).toBe('2');
  });
}
