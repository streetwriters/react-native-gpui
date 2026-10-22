import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * Host components, end to end (design 2, sections 5.1, 5.3 and 6.1).
 *
 * Every assertion here is about a number a test can compute: a measured
 * component's size is `text.length * characterWidth` by `lineHeight`, a
 * container's insets are its chrome, and an event's payload is the point that
 * was selected. That is deliberate — "an event arrived" would pass on a
 * component that emitted the wrong payload.
 */

let app: DesktopApp;

async function launch(
  module: string,
  scenario?: string,
  initialProps: Record<string, unknown> = {},
  extraEnv: Record<string, string> = {},
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
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  return app;
}

async function textOf(testID: string): Promise<string> {
  return (await app.getByTestId(testID).textContent()) ?? '';
}

async function frameOf(
  testID: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  // `exact`, because a query with `exact = false` matches on substring: a
  // `testID` that prefixes another node's would return whichever came first, and
  // the assertion would be about the wrong node — or about a `View` rather than
  // the host component it names.
  const [node] = await app.query('testID', testID, true);
  if (!node) throw new Error(`no node for ${testID}`);
  return node.frame;
}

async function clickTestID(testID: string) {
  const [node] = await app.query('testID', testID, true);
  if (!node) throw new Error(`no node for ${testID}`);
  await app.click((node as { tag: number }).tag);
  await app.waitForIdle();
}

afterAll(async () => {
  app?.disconnect();
});

test('a host component receives the props a test passed it', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();
  // The chart draws its own content and takes the node's frame from its style.
  const frame = await frameOf('host-chart');
  expect(frame.height).toBe(120);
  expect(frame.width).toBe(240);
  expect(Number.isFinite(frame.x) && Number.isFinite(frame.y)).toBe(true);
});

test('a command from JS reaches the host component and it emits an event back', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();
  expect(await textOf('host-components-selected')).toContain('selected: none');

  await clickTestID('host-chart-select');
  const selected = await textOf('host-components-selected');
  // `selectPoint(2)` must report the third point's own coordinates, which is
  // what makes this an assertion about the component and not just the bridge.
  expect(selected).toContain('index=2');
  expect(selected).toContain('x=2');
  expect(selected).toContain('y=2');
});

test('a second command reports the series again', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  // `reportSeries` answers through `pointSelected`, so the count is what proves
  // the report arrived — asserting the selection text would pass on the earlier
  // `selectPoint` click alone and prove nothing about the second command.
  expect(await textOf('host-components-series')).toContain('series reports: 0');
  await clickTestID('host-chart-report');
  expect(await textOf('host-components-series')).toContain('series reports: 1');

  // A prop change reports too: `reportToken` is the chart's own trigger, and it
  // emits from `update`, which used to drop its events. The count must go *up*
  // after the bump — asserting the unchanged selection text would pass even with
  // the update path still broken.
  await clickTestID('host-chart-token');
  expect(await textOf('host-components-series')).toContain('series reports: 2');
  // The coordinates are the first point's own, (0, 1): an `update` that saw
  // props with the series missing would report (0, 0).
  expect(await textOf('host-components-selected')).toContain('index=0 x=0 y=1');
});

test('props survive a partial update', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  await clickTestID('host-chart-select');
  expect(await textOf('host-components-selected')).toContain('index=2 x=2 y=2');

  // `title` is a different prop from `points`. Fabric hands the props class only
  // what React resent, so a props class rebuilt from that alone would lose the
  // series here; the typed props keep what was not resent.
  await clickTestID('host-chart-title');
  await clickTestID('host-chart-title');
  await clickTestID('host-chart-report');
  expect(await textOf('host-components-selected')).toContain('index=2 x=2 y=2');
});

test('a measured component reports its size and its parent lays out around it', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  // text "abcd" at characterWidth 10 by lineHeight 20. The fixture opts out of
  // the column's default stretch so the reported width is not hidden behind the
  // container's; height would prove the measurement either way.
  const measured = await frameOf('host-measured');
  expect(measured.width).toBe(40);
  expect(measured.height).toBe(20);

  // The sibling below it must start at or after the measured component's bottom,
  // which only holds if Yoga used the reported size rather than the default.
  const sibling = await frameOf('measured-sibling');
  expect(sibling.y).toBeGreaterThanOrEqual(measured.y + measured.height);
});

test('a measured component inside a scroll view keeps tracking the scroll', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  const before = await frameOf('host-measured-in-scroll');
  expect(before.width).toBe(54); // "scroll" (6) at characterWidth 9
  expect(before.height).toBe(18);

  const scroll = await app.query('testID', 'host-scroll', true);
  const scrollTag = (scroll[0] as { tag: number }).tag;
  await app.scroll(scrollTag, 0, -20, 4);
  await app.waitForIdle();

  // The measured label moves with the scrolled content rather than staying put,
  // which is the property the scroll-layer strategy exists to protect.
  const after = await frameOf('host-measured-in-scroll');
  expect(after.y).toBeLessThan(before.y);
  // And it keeps its reported size: a scroll must not re-measure it to zero.
  expect(after.width).toBe(54);
  expect(after.height).toBe(18);
});

test('a container host component insets its React children by the chrome it reports', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  const card = await frameOf('host-card');
  const child = await frameOf('card-child');
  // chromeHeight 28 above, chromeWidth 12 on the left, both reported through
  // Fabric state and applied on the next commit.
  expect(child.y - card.y).toBeGreaterThanOrEqual(28);
  expect(child.x - card.x).toBeGreaterThanOrEqual(12);
});

/**
 * The performance rules of design 2, section 7, asserted with counts: timings
 * are noisy and these are exact.
 */
test('a tree with no host component pays nothing for them', async () => {
  // The tester links the fixtures, so the C++ table exists and each mount op
  // does one lock-free lookup in it (`hostEntryLookups`). Everything that costs
  // more than that is behind a node that actually is a host component, and this
  // tree has none.
  await launch('TextFixture');
  await app.waitForIdle();
  const counters = await app.hostCounters();
  expect(counters.hostRegistryLookups).toBe(0);
  expect(counters.nativeSurfaceWalkNodes).toBe(0);
  expect(counters.hostPropsBytesCopied).toBe(0);
  expect(counters.hostUpdateCalls).toBe(0);
  expect(counters.hostReportsDelivered).toBe(0);
});

test('a host component costs nothing for a prop it did not change', async () => {
  await launch('HostComponentsFixture', 'large-series');
  await app.waitForIdle();
  await app.hostCounters({ reset: true });

  // 100 changes to `title`, with 10,000 points beside it.
  for (let index = 0; index < 100; index += 1) {
    await clickTestID('host-chart-title');
  }
  const counters = await app.hostCounters({ reset: true });
  // Not one byte of the props is copied, serialised or parsed (rule 4), and the
  // component's `update` ran once per change, not once per commit.
  expect(counters.hostPropsBytesCopied).toBe(0);
  expect(counters.hostUpdateCalls).toBe(100);
});

test('a layout-only commit does not call the component', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();
  await app.hostCounters({ reset: true });

  // Resizing the window re-lays out the tree and commits, without changing any
  // prop of the chart: the props object is the same one, so nothing crosses and
  // `update` is not called (5.2).
  await app.setWindowSize(900, 700);
  await app.waitForIdle();
  await app.setWindowSize(1024, 768);
  await app.waitForIdle();
  const counters = await app.hostCounters({ reset: true });
  expect(counters.hostUpdateCalls).toBe(0);
  expect(counters.hostPropsBytesCopied).toBe(0);
});

test('a scroll view holding only GPUI components keeps the composited scroll', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();
  const [scroll] = await app.query('testID', 'host-scroll', true);
  const props = (await app.getProps((scroll as { tag: number }).tag)) as {
    scrollStrategy: string | null;
  };
  // A host component that paints GPUI elements has none of a native surface's
  // limits, so it must not push its scroll view onto the manual-offset path.
  expect(props.scrollStrategy).toBe('GpuiLayer');
  await app.hostCounters({ reset: true });
  const counters = await app.hostCounters();
  expect(counters.nativeSurfaceWalkNodes).toBe(0);
});
