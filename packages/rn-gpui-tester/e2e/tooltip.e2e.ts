import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

async function start(env: Record<string, string>) {
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      ...env,
      RN_GPUI_MODULE: 'RNGPUITester--tooltip',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-tooltip')).toBeVisible();
}

async function centre(testID: string) {
  const [node] = await app.query('testID', testID, true);
  const top = (await app.menuBarState()).inset;
  return {
    x: node.frame.x + node.frame.width / 2,
    y: node.frame.y + node.frame.height / 2 + top,
  };
}

afterAll(() => app?.close());

describe.each([
  ['the system tooltip', {} as Record<string, string>],
  ['the drawn tooltip', { RN_GPUI_TOOLTIP: 'drawn' }],
])('%s', (_name, env) => {
  beforeAll(async () => {
    await app?.close();
    await start(env);
  });

  test('is set for the view under the pointer and for a child of it', async () => {
    expect((await app.tooltip()).text).toBeNull();
    await app.mouseMove(await centre('tooltip-target'));
    await app.waitForIdle();
    let state = await app.tooltip();
    expect(state.text).toBe('Create a note');
    const [target] = await app.query('testID', 'tooltip-target', true);
    expect(state.rect?.[2]).toBeCloseTo(target.frame.width, 0);
    expect(state.rect?.[3]).toBeCloseTo(target.frame.height, 0);
    await app.mouseMove(await centre('tooltip-child'));
    await app.waitForIdle();
    state = await app.tooltip();
    expect(state.text).toBe('Create a note');
  });

  test('goes away when the pointer leaves, and follows a change of the text', async () => {
    await app.mouseMove(await centre('tooltip-none'));
    await app.waitForIdle();
    expect((await app.tooltip()).text).toBeNull();
    await app.mouseMove(await centre('tooltip-target'));
    await app.waitForIdle();
    expect((await app.tooltip()).text).toBe('Create a note');
    await app.getByTestId('tooltip-change').click();
    await app.mouseMove(await centre('tooltip-target'));
    await app.waitForIdle();
    expect((await app.tooltip()).text).toBe('Create a notebook');
  });

  test('is cleared by a press and when the view unmounts', async () => {
    await app.mouseMove(await centre('tooltip-target'));
    await app.waitForIdle();
    expect((await app.tooltip()).text).toBe('Create a notebook');
    await app.getByTestId('tooltip-toggle').click();
    await app.waitForIdle();
    expect((await app.tooltip()).text).toBeNull();
    await app.getByTestId('tooltip-toggle').click();
    await app.waitForIdle();
  });

  test.runIf(process.platform === 'darwin')(
    'is the accessibility description of the view',
    async () => {
      await expect
        .poll(async () => JSON.stringify(await app.a11yTree()), {
          timeout: 5_000,
        })
        .toContain('Create a notebook');
    },
  );
});

test.runIf(process.platform === 'darwin')(
  'the system tooltip is registered with AppKit and removed with the pointer',
  async () => {
    await app?.close();
    await start({});
    const before = (await app.tooltip()).trackingAreas;
    await app.mouseMove(await centre('tooltip-target'));
    await app.waitForIdle();
    const over = await app.tooltip();
    expect(over.mode).toBe('native');
    expect(over.ownerText).toBe('Create a note');
    expect(over.trackingAreas).toBeGreaterThan(before);
    await app.mouseMove(await centre('tooltip-none'));
    await app.waitForIdle();
    expect((await app.tooltip()).trackingAreas).toBe(before);
  },
);

test('the zoom factor of the window scales the tooltip rectangle', async () => {
  await app?.close();
  await start({});
  const [target] = await app.query('testID', 'tooltip-target', true);
  await app.mouseMove(await centre('tooltip-target'));
  await app.waitForIdle();
  const natural = (await app.tooltip()).rect as number[];
  expect(natural[2]).toBeCloseTo(target.frame.width, 0);
  await app.getByTestId('tooltip-zoom').click();
  await app.waitForIdle();
  const [after] = await app.query('testID', 'tooltip-target', true);
  const top = (await app.menuBarState()).inset;
  await app.mouseMove({
    x: (after.frame.x + after.frame.width / 2) * 1.5,
    y: (after.frame.y + after.frame.height / 2) * 1.5 + top,
  });
  await app.waitForIdle();
  const zoomed = (await app.tooltip()).rect as number[];
  expect(zoomed[2]).toBeCloseTo(natural[2] * 1.5, 0);
  expect(zoomed[3]).toBeCloseTo(natural[3] * 1.5, 0);
});

test('the drawn tooltip shows after the delay and hides when the pointer leaves', async () => {
  await app?.close();
  await start({ RN_GPUI_TOOLTIP: 'drawn' });
  await app.mouseMove(await centre('tooltip-target'));
  await expect
    .poll(async () => (await app.tooltip()).drawn, { timeout: 3_000 })
    .toBe('Create a note');
  await app.mouseMove(await centre('tooltip-none'));
  await app.waitForIdle();
  expect((await app.tooltip()).drawn).toBeNull();
});
