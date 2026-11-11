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
      RN_GPUI_MODULE: 'RNGPUITester--wheel',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('wheel-target')).toBeVisible();
});

afterAll(() => app?.close());

async function tag(testID: string) {
  const [node] = await app.query('testID', testID, true);
  return node.tag as number;
}

async function text(testID: string) {
  const [node] = await app.query('testID', testID, true);
  return (node.text ?? '') as string;
}

async function last() {
  return JSON.parse(await text('wheel-last'));
}

async function wheel(
  testID: string,
  dx: number,
  dy: number,
  options: Parameters<DesktopApp['scroll']>[6] = {},
  phase?: 'started' | 'moved' | 'ended',
) {
  await app.scroll(await tag(testID), dx, dy, 1, phase, 0, options);
  await app.waitForIdle();
}

async function reset() {
  await app.scroll(await tag('wheel-scroll'), 0, 5000);
  await app.waitForIdle();
}

test('wheel deltas reach the handler with the web signs and the pointer position', async () => {
  await wheel('wheel-target', 0, -40);
  const event = await last();
  expect(event.deltaY).toBe(40);
  expect(event.deltaX).toBe(0);
  expect(event.deltaMode).toBe(0);
  expect(event.isTrackpad).toBe(true);
  expect(event.target).toBe(await tag('wheel-target'));
  expect(event.ctrlKey).toBe(false);
  expect(event.clientX).toBeGreaterThan(0);
  expect(event.offsetX).toBeGreaterThan(0);
});

test('capture runs before bubble, from the outside in, and bubble from the inside out', async () => {
  await wheel('wheel-target', 0, -10);
  expect((await text('wheel-log')).split(',').slice(-4)).toEqual([
    'capture:outer',
    'capture:target',
    'bubble:target',
    'bubble:outer',
  ]);
});

test('an unhandled wheel still scrolls the parent ScrollView, and preventDefault keeps it still', async () => {
  await reset();
  expect(Number(await text('wheel-offset'))).toBe(0);
  await wheel('wheel-plain', 0, -30);
  expect(Number(await text('wheel-offset'))).toBeGreaterThan(0);
  await reset();
  await wheel('wheel-target', 0, -30);
  expect(Number(await text('wheel-offset'))).toBeGreaterThan(0);
  const moved = Number(await text('wheel-offset'));
  try {
    await app.getByTestId('wheel-prevent-toggle').click();
    await app.waitForIdle();
    expect(await text('wheel-prevent')).toBe('prevent');
    await wheel('wheel-target', 0, -30);
    expect(Number(await text('wheel-offset'))).toBe(moved);
  } finally {
    if ((await text('wheel-prevent')) === 'prevent') {
      await app.getByTestId('wheel-prevent-toggle').click();
      await app.waitForIdle();
    }
  }
});

test('a view with no wheel handler on its path scrolls the ScrollView without waiting for JS', async () => {
  await reset();
  await app.scroll(await tag('wheel-scroll'), 0, -30);
  await app.waitForIdle();
  expect(Number(await text('wheel-offset'))).toBeGreaterThan(0);
});

test('a mouse wheel notch reports lines, and shift turns it into a horizontal delta', async () => {
  await wheel('wheel-target', 0, -2, { lines: true });
  let event = await last();
  expect(event.deltaMode).toBe(1);
  expect(event.isTrackpad).toBe(false);
  expect(event.phase).toBe('none');
  expect(event.deltaY).toBe(2);
  await wheel('wheel-target', 0, -2, {
    lines: true,
    modifiers: { shift: true },
  });
  event = await last();
  expect(event.shiftKey).toBe(true);
  expect(event.deltaX).toBe(2);
  expect(event.deltaY).toBe(0);
});

test('trackpad phases and momentum are reported', async () => {
  await reset();
  await wheel('wheel-target', 0, -5, {}, 'started');
  expect((await last()).phase).toBe('began');
  await wheel('wheel-target', 0, -5, {}, 'moved');
  const during = await last();
  expect(during.phase).toBe('changed');
  expect(during.momentum).toBe(false);
  await wheel('wheel-target', 0, 0, {}, 'ended');
  expect((await last()).phase).toBe('ended');
  await wheel('wheel-target', 0, -3, {}, 'moved');
  const after = await last();
  expect(after.momentum).toBe(true);
  expect(after.deltaY).toBe(3);
  await wheel('wheel-target', 0, -5, {}, 'started');
  await wheel('wheel-target', 0, -5, {}, 'moved');
  expect((await last()).momentum).toBe(false);
});

test('a pinch arrives as a wheel event with ctrlKey and the zoom as deltaY', async () => {
  await reset();
  await app.pinch(await tag('wheel-target'), 0.05, 'started');
  await app.waitForIdle();
  const event = await last();
  expect(event.isPinch).toBe(true);
  expect(event.ctrlKey).toBe(true);
  expect(event.deltaY).toBeCloseTo(-5, 4);
  expect(event.phase).toBe('began');
});

test('preventDefault on a pinch and a wheel lets a canvas own the gesture: pan and zoom follow the events in order', async () => {
  const canvas = await tag('wheel-canvas');
  await app.scroll(canvas, -10, -20);
  await app.waitForIdle();
  await app.scroll(canvas, -10, -20);
  await app.waitForIdle();
  expect(await text('wheel-canvas-state')).toBe('-20.0,-40.0,1.000');
  await app.pinch(canvas, 0.1);
  await app.waitForIdle();
  const [, , scale] = (await text('wheel-canvas-state')).split(',');
  expect(Number(scale)).toBeCloseTo(Math.exp(0.1), 2);
});

test('input to handler latency is reported by the fixture', async () => {
  const canvas = await tag('wheel-canvas');
  for (let step = 0; step < 20; step++) {
    await app.scroll(canvas, 0, -1);
    await app.waitForIdle();
  }
  const [count, , max] = (await text('wheel-latency')).split(',').map(Number);
  expect(count).toBeGreaterThanOrEqual(20);
  console.log(
    `wheel input-to-handler latency: max ${max} ms over ${count} events`,
  );
  expect(max).toBeLessThan(250);
});

test('layoutStats counts precise scroll events and the ones that move by whole device pixels', async () => {
  await app.layoutStats({ reset: true });
  const target = await tag('wheel-canvas');
  await app.scroll(target, 0, -10);
  await app.scroll(target, 0, -0.123);
  await app.waitForIdle();
  const stats = await app.layoutStats({ reset: true });
  expect(stats.scrollEvents).toBe(2);
  expect(stats.scrollEventsWholePixel).toBe(1);
});
