import path from 'node:path';
import { PNG } from 'pngjs';
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
      RN_GPUI_MODULE: 'NativeRootFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('native-root')).toBeVisible();
});

afterAll(() => app?.close());

const rgbAt = (image: PNG, x: number, y: number) => {
  const index = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
};

async function swatches() {
  const image = PNG.sync.read(
    await app.getByTestId('native-root').screenshot(),
  );
  const scale = image.width / 240;
  const row = 4 + 30 + 4 + 15;
  return [0, 1, 2].map(index => {
    const [r, g, b] = rgbAt(image, (4 + index * 44 + 20) * scale, row * scale);
    return r > 200 ? 'red' : g > 200 ? 'green' : b > 200 ? 'blue' : 'none';
  });
}

async function press(x: number, y: number) {
  const [root] = await app.query('testID', 'native-root', true);
  const top = (await app.menuBarState()).inset;
  const at = { x: root.frame.x + x, y: root.frame.y + y + top };
  await app.mouseDown(at);
  await app.mouseUp(at);
  await app.waitForIdle();
}

test('measures: what one commit of a thousand-instance native tree costs', async () => {
  await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'NativeRootLoadFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    initialProps: { count: 1000 },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('load-root')).toBeVisible();
  await app.hostCounters({ reset: true });
  const samples: string[] = [];
  for (let step = 0; step < 5; step++) {
    await app.getByTestId('load-tick').click();
    await app.waitForIdle();
    samples.push(await app.getByTestId('load-stats').textContent());
  }
  const counters = await app.hostCounters();
  console.log('per commit (ops,bytes,js ms):', samples.join(' | '));
  console.log(
    `native: ${counters.nativeOpsApplied / 5} ops, apply ${(counters.nativeApplyMicros / 5 / 1000).toFixed(2)} ms, render ${(counters.nativeRenderMicros / 5 / 1000).toFixed(2)} ms per commit`,
  );
  expect(counters.nativeOpsApplied).toBeGreaterThanOrEqual(5000);
  await app.close();
  app = await launchApp({
    bundle: path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    ),
    env: {
      RN_GPUI_MODULE: 'NativeRootFixture',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(600, 500);
  await desktopExpect(app.getByTestId('native-root')).toBeVisible();
});

test('a native tree is laid out by gpui inside the box Yoga sized', async () => {
  const [root] = await app.query('testID', 'native-root', true);
  expect(root.frame.width).toBe(240);
  expect(root.frame.height).toBe(120);
  expect(await swatches()).toEqual(['red', 'green', 'blue']);
});

test('a press on a nested native component reaches its handler in React, with the context of the outer tree', async () => {
  await press(20, 14);
  await desktopExpect(app.getByTestId('native-last')).toHaveText(
    'last:pressed blue 1',
  );
  await press(20, 14);
  await desktopExpect(app.getByTestId('native-last')).toHaveText(
    'last:pressed blue 2',
  );
  await expect
    .poll(async () => (await app.query('text', 'count 2', true)).length)
    .toBe(1);
  await press(4 + 20, 4 + 30 + 4 + 15);
  await desktopExpect(app.getByTestId('native-last')).toHaveText('last:red');
});

test('the test driver sees the instances: tree dump, locators by testID, a click through a locator, and the accessibility tree', async () => {
  const find = (node: any, id: string): any =>
    node.testID === id
      ? node
      : node.children?.map((child: any) => find(child, id)).find(Boolean);
  const counter = find(await app.tree(), 'native-counter');
  expect(counter.native).toBe(true);
  expect(counter.component).toBe('FixtureNativeBox');
  expect(counter.role).toBe('button');
  expect(counter.frame[2]).toBeGreaterThan(100);

  const [green] = await app.query('testID', 'native-swatch-green', true);
  expect(green.visible).toBe(true);
  expect(green.frame.width).toBe(40);
  await app.getByTestId('native-swatch-green').click();
  await desktopExpect(app.getByTestId('native-last')).toHaveText('last:green');

  if (app.nativeA11ySupported) {
    const node = await app.a11yNode('native-counter');
    expect(node?.role).toMatch(/button/i);
    expect(node?.name).toBe('Counter');
  }
});

test('a keyed reorder in React moves the native instances', async () => {
  await app.getByTestId('native-reorder').click();
  await app.waitForIdle();
  expect(await swatches()).toEqual(['blue', 'red', 'green']);
  await press(4 + 20, 4 + 30 + 4 + 15);
  await desktopExpect(app.getByTestId('native-last')).toHaveText('last:blue');
});

async function traceRemoval(label: string) {
  if (!process.env.CI) return;
  const count = (node: any): number =>
    (node.native ? 1 : 0) +
    (node.children ?? []).reduce(
      (sum: number, child: any) => sum + count(child),
      0,
    );
  const samples: string[] = [];
  const started = Date.now();
  for (let step = 0; step < 10; step += 1) {
    const raw = PNG.sync.read(
      await app.getByTestId('native-root').screenshot(),
    );
    const scale = raw.width / 240;
    const pixels = [0, 1, 2].map(index =>
      rgbAt(raw, (4 + index * 44 + 20) * scale, (4 + 30 + 4 + 15) * scale),
    );
    samples.push(
      `${Date.now() - started}ms ${(await swatches()).join(',')} rgb=${JSON.stringify(pixels)} image=${raw.width}x${raw.height}`,
    );
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const nodes = await app.query('testID', 'native-unmount', true);
  const idle = await app.idleStatus();
  const tree = await app.tree();
  console.log(
    `NATIVEROOTTRACE ${label} unmount=${JSON.stringify(nodes.map((node: any) => ({ tag: node.tag, frame: node.frame, visible: node.visible })))} nativeInstances=${count(tree)} idle=${idle.idle} busy=${JSON.stringify(idle.busySources)}\n${samples.join('\n')}`,
  );
}

test('removing a component from the tree removes its instances', async () => {
  await traceRemoval('before click');
  await app.getByTestId('native-unmount').click();
  await app.waitForIdle();
  await traceRemoval('after click');
  expect(await swatches()).toEqual(['none', 'none', 'none']);
});
