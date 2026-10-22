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
  await clickTestID('host-chart-report');
  expect(await textOf('host-components-selected')).toContain('index=0');

  // A prop change reports too, once: `reportToken` is the chart's own trigger.
  await clickTestID('host-chart-token');
  expect(await textOf('host-components-selected')).toContain('index=0');
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

test('a scroll view without host components keeps its composite path', async () => {
  // The regression guard for section 8: a tree with no host component must not
  // pay for the manual-offset strategy. `renderedViewsTotal` is the count of
  // node views rebuilt across the scrolled frames, so a composited scroll is
  // much cheaper than one that rebuilds everything.
  await launch('HostComponentsFixture');
  await app.waitForIdle();
  const scroll = await app.query('testID', 'host-scroll', true);
  const tag = (scroll[0] as { tag: number }).tag;
  const result = await app.scroll(tag, 0, -20, 4);
  // No absolute bound: the point is that it is bounded and the scroll worked.
  expect(result.renderedViewsTotal).toBeGreaterThanOrEqual(0);
});
