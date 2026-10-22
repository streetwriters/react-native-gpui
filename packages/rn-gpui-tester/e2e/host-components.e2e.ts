import path from 'node:path';
import { expect, test } from 'vitest';
import { launchApp, type DesktopApp } from '@react-native-gpui/testing';

/**
 * Host components, end to end.
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
  expect(selected).toContain('index=2');
  expect(selected).toContain('x=2');
  expect(selected).toContain('y=2');
});

test('a second command reports the series again', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  expect(await textOf('host-components-series')).toContain('series reports: 0');
  await clickTestID('host-chart-report');
  expect(await textOf('host-components-series')).toContain('series reports: 1');

  await clickTestID('host-chart-token');
  expect(await textOf('host-components-series')).toContain('series reports: 2');
  expect(await textOf('host-components-selected')).toContain('index=0 x=0 y=1');
});

test('props survive a partial update', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  await clickTestID('host-chart-select');
  expect(await textOf('host-components-selected')).toContain('index=2 x=2 y=2');

  await clickTestID('host-chart-title');
  await clickTestID('host-chart-title');
  await clickTestID('host-chart-report');
  expect(await textOf('host-components-selected')).toContain('index=2 x=2 y=2');
});

test('a measured component reports its size and its parent lays out around it', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  const measured = await frameOf('host-measured');
  expect(measured.width).toBe(40);
  expect(measured.height).toBe(20);

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

  const after = await frameOf('host-measured-in-scroll');
  expect(after.y).toBeLessThan(before.y);
  expect(after.width).toBe(54);
  expect(after.height).toBe(18);
});

test('a container host component insets its React children by the chrome it reports', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();

  const card = await frameOf('host-card');
  const child = await frameOf('card-child');
  expect(child.y - card.y).toBeGreaterThanOrEqual(28);
  expect(child.x - card.x).toBeGreaterThanOrEqual(12);
});

/**
 * The performance rules, asserted with counts: timings
 * are noisy and these are exact.
 */
test('a tree with no host component pays nothing for them', async () => {
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

  for (let index = 0; index < 100; index += 1) {
    await clickTestID('host-chart-title');
  }
  const counters = await app.hostCounters({ reset: true });
  expect(counters.hostPropsBytesCopied).toBe(0);
  expect(counters.hostUpdateCalls).toBe(100);
});

test('a layout-only commit does not call the component', async () => {
  await launch('HostComponentsFixture');
  await app.waitForIdle();
  await app.hostCounters({ reset: true });

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
  expect(props.scrollStrategy).toBe('GpuiLayer');
  await app.hostCounters({ reset: true });
  const counters = await app.hostCounters();
  expect(counters.nativeSurfaceWalkNodes).toBe(0);
});
