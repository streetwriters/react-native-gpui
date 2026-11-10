import path from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  launchApp,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

async function start(initialProps: Record<string, unknown> = {}) {
  await app?.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'NativeVirtualListFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    initialProps,
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 700);
  await desktopExpect(app.getByTestId('vlist-root')).toBeVisible();
}

beforeAll(() => start());
afterAll(() => app?.close());

const frameOf = async (testID: string) =>
  (await app.query('testID', testID, true))[0]?.frame;
const has = async (testID: string) => (await frameOf(testID)) != null;
const log = async () =>
  (await app.getByTestId('vlist-log').textContent()) ?? '';

async function pressCentre(testID: string) {
  const frame = (await frameOf(testID))!;
  const top = (await app.menuBarState()).inset;
  const at = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2 + top,
  };
  await app.mouseMove(at);
  await app.mouseDown(at);
  await app.mouseUp(at);
  await app.waitForIdle();
}

const created = async () => {
  await app.getByTestId('vlist-read').click();
  await app.waitForIdle();
  return Number(
    ((await app.getByTestId('vlist-created').textContent()) ?? '').split(
      ':',
    )[1],
  );
};

test('only the items in view and a little more exist, with the height of their content', async () => {
  await expect.poll(() => has('vrow-0'), { timeout: 5000 }).toBe(true);
  expect(await has('vrow-200')).toBe(false);
  await expect
    .poll(
      async () =>
        Math.round((await frameOf('vrow-1'))!.y - (await frameOf('vrow-0'))!.y),
      { timeout: 5000 },
    )
    .toBe(20);
  const first = (await frameOf('vrow-0'))!;
  const second = (await frameOf('vrow-1'))!;
  expect(Math.round(first.height)).toBe(20);
  expect(Math.round(second.height)).toBe(30);
  expect(Math.round(second.y - first.y)).toBe(20);
});

test('scrolling brings the items in view and drops the others; each keeps its own React state', async () => {
  const before = await created();
  const [list] = await app.query('testID', 'vlist-root', true);
  for (let step = 0; step < 10; step++) {
    await app.scroll(list.tag, 0, -100);
  }
  await app.waitForIdle();
  await expect.poll(() => has('vrow-30'), { timeout: 5000 }).toBe(true);
  expect(await has('vrow-0')).toBe(false);
  await pressCentre('vrow-30');
  expect(await log()).toContain('30:30,');
  const after = await created();
  expect(after - before).toBeLessThan(80);
});

test('scrollToIndex puts an item at the start, centre or end of the viewport', async () => {
  const root = (await frameOf('vlist-root'))!;
  await app.getByTestId('vlist-start').click();
  await expect.poll(() => has('vrow-500'), { timeout: 5000 }).toBe(true);
  await expect
    .poll(async () => Math.round((await frameOf('vrow-500'))!.y - root.y), {
      timeout: 5000,
    })
    .toBe(0);
  await app.getByTestId('vlist-center').click();
  await expect
    .poll(
      async () => {
        const row = await frameOf('vrow-800');
        return row == null
          ? 999
          : Math.round(row.y + row.height / 2 - (root.y + root.height / 2));
      },
      { timeout: 5000 },
    )
    .toBe(0);
  await app.getByTestId('vlist-end').click();
  await expect
    .poll(
      async () => {
        const row = await frameOf('vrow-1200');
        return row == null
          ? 999
          : Math.round(row.y + row.height - (root.y + root.height));
      },
      { timeout: 5000 },
    )
    .toBe(0);
  await app.getByTestId('vlist-top').click();
  await expect.poll(() => has('vrow-0'), { timeout: 5000 }).toBe(true);
});

test('an item above the viewport that changes size does not move what is on screen', async () => {
  await app.getByTestId('vlist-start').click();
  await expect.poll(() => has('vrow-500'), { timeout: 5000 }).toBe(true);
  await app.waitForIdle();
  const before = (await frameOf('vrow-500'))!.y;
  await app.getByTestId('vlist-grow').click();
  await app.waitForIdle();
  await expect
    .poll(async () => (await frameOf('vrow-498'))!.height, { timeout: 5000 })
    .toBeGreaterThan(60);
  await app.waitForIdle();
  expect(Math.abs((await frameOf('vrow-500'))!.y - before)).toBeLessThan(1);
});

test('a press on an item after scrolling reaches that item, and an item may hold a slot', async () => {
  await app.getByTestId('vlist-start').click();
  await expect.poll(() => has('vslot-507'), { timeout: 5000 }).toBe(true);
  await pressCentre('vrow-501');
  expect(await log()).toContain('501:501,');
});

test('reaching the end calls onEndReached once', async () => {
  await start({ count: 30 });
  await expect
    .poll(
      async () => (await app.getByTestId('vlist-ends').textContent()) ?? '',
      { timeout: 5000 },
    )
    .toBe('ends:0');
  const [list] = await app.query('testID', 'vlist-root', true);
  for (let step = 0; step < 12; step++) {
    await app.scroll(list.tag, 0, -100);
  }
  await app.waitForIdle();
  await expect
    .poll(
      async () => (await app.getByTestId('vlist-ends').textContent()) ?? '',
      { timeout: 5000 },
    )
    .toBe('ends:1');
});

test('measures: native instances are reused underneath, and only the opt-in recycles React state', async () => {
  await start();
  const [list] = await app.query('testID', 'vlist-root', true);
  await app.hostCounters({ reset: true });
  for (let step = 0; step < 40; step++) {
    await app.scroll(list.tag, 0, -50);
  }
  await app.waitForIdle();
  const counters = await app.hostCounters();
  console.log(
    `identity kept: created ${counters.nativeInstancesCreated}, recycled ${counters.nativeInstancesRecycled}`,
  );
  expect(counters.nativeInstancesRecycled).toBeGreaterThan(0);

  await start({ recycleItems: true });
  const [recycled] = await app.query('testID', 'vlist-root', true);
  for (let step = 0; step < 10; step++) {
    await app.scroll(recycled.tag, 0, -100);
  }
  await app.waitForIdle();
  const rows = [];
  for (let index = 30; index < 60; index++) {
    if (await has(`vrow-${index}`)) rows.push(index);
  }
  expect(rows.length).toBeGreaterThan(0);
  await pressCentre(`vrow-${rows[0]}`);
  const entry = (await log()).split(',').filter(Boolean).pop()!;
  const [index, born] = entry.split(':').map(Number);
  expect(born).not.toBe(index);
});
