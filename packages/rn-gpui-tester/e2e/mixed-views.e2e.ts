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
      RN_GPUI_MODULE: 'RNGPUITester--mixed-views',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1400, 1000);
  await desktopExpect(app.getByTestId('mixed-card')).toBeVisible();
});

afterAll(() => app?.close());

const text = (testID: string) => app.getByTestId(testID).textContent();

test('works: a press and a hover reach React children inside a container host component', async () => {
  await app.getByTestId('mixed-press').click();
  await desktopExpect(app.getByTestId('mixed-presses')).toHaveText('presses:1');
  await app.getByTestId('mixed-press').hover();
  await desktopExpect(app.getByTestId('mixed-hover')).toHaveText('hover:in');
});

test('a container own GPUI element hears hover, press and click over a React child', async () => {
  await app.getByTestId('mixed-press').hover();
  await app.waitForIdle();
  expect(await text('mixed-chrome')).toContain('hover-in');
  await app.getByTestId('mixed-press').click();
  await app.waitForIdle();
  const events = await text('mixed-chrome');
  expect(events).toContain('down,');
  expect(events).toContain('click,');
  expect(events).toContain('up,');
  await desktopExpect(app.getByTestId('mixed-presses')).toHaveText('presses:2');
});

test('works: a TextInput inside a container host component focuses and types', async () => {
  await app.getByTestId('mixed-input').type('abc');
  await desktopExpect(app.getByTestId('mixed-typed')).toHaveText('typed:abc');
});

test('works: a key pressed on a focusable React child reaches its onKeyDown', async () => {
  await app.getByTestId('mixed-key').press('x');
  await desktopExpect(app.getByTestId('mixed-keys')).toHaveText('keys:x');
});

test('works: React context reaches children of the container and a Modal opened inside it', async () => {
  expect(await text('mixed-ctx')).toBe('ctx:blue');
  await app.getByTestId('mixed-modal-open').click();
  await desktopExpect(app.getByTestId('modal-ctx')).toBeVisible();
  expect(await text('modal-ctx')).toBe('ctx:blue');
  const [card] = await app.query('testID', 'mixed-card', true);
  const [modal] = await app.query('testID', 'modal-ctx', true);
  const inside =
    modal.frame.x >= card.frame.x &&
    modal.frame.y >= card.frame.y &&
    modal.frame.x + modal.frame.width <= card.frame.x + card.frame.width &&
    modal.frame.y + modal.frame.height <= card.frame.y + card.frame.height;
  expect(inside).toBe(false);
  await app.getByTestId('modal-close').click();
});

test('works: a ReactSurface placed by a host component renders, takes JSON props, and handles press, hover and typing', async () => {
  await desktopExpect(app.getByTestId('probe-greeting')).toHaveText(
    'greeting:hello',
  );
  await app.getByTestId('probe-press').click();
  await desktopExpect(app.getByTestId('probe-count')).toHaveText('count:1');
  await app.getByTestId('probe-press').hover();
  await desktopExpect(app.getByTestId('probe-hover')).toHaveText('hover:in');
  await app.getByTestId('probe-input').type('hi');
  await desktopExpect(app.getByTestId('probe-typed')).toHaveText('typed:hi');
});

test('works with a React round trip: an offset applied as a transform inside a clip moves rows and hit testing follows it', async () => {
  const frame = async (id: string) => (await app.query('testID', id, true))[0];
  const before = (await frame('row-5')).frame.y;
  await app.getByTestId('mixed-scroll').click();
  await desktopExpect(app.getByTestId('row-5')).toBeVisible();
  const after = await frame('row-5');
  expect(before - after.frame.y).toBeCloseTo(100, 0);
  await app.getByTestId('row-5').click();
  await desktopExpect(app.getByTestId('mixed-row-pressed')).toHaveText(
    'pressed:row-5',
  );
  expect((await frame('row-0')).visible).toBe(false);
});

test('measures: what moving a 30-row window costs when the rows are remounted and when they are recycled', async () => {
  const run = async (steps: number) => {
    await app.layoutStats({ reset: true });
    for (let index = 0; index < steps; index++) {
      await app.getByTestId('recycle-step').click();
      await app.waitForIdle();
    }
    const stats = await app.layoutStats();
    return Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [key, value / steps]),
    );
  };
  const remount = await run(5);
  await app.getByTestId('recycle-mode').click();
  const recycle = await run(5);
  console.log('per step, remount', JSON.stringify(remount));
  console.log('per step, recycle', JSON.stringify(recycle));
  expect(Object.keys(remount).length).toBeGreaterThan(0);
});

test.todo(
  'gap 1: a host component places its React children itself (no API: a child frame comes only from Yoga inside the inset box)',
);
test.todo(
  'gap 2: a host component asks for a child size under a constraint of its own (no API: only the container width constrains a child)',
);
test.todo(
  'gap 5: React content mounted into an overlay slot of a gpui root layer, in the same React root (needs the kit root; Modal reaches the window overlay only)',
);
