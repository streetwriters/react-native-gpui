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
      RN_GPUI_MODULE: 'RNGPUITester--drag-drop',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_TEST_FAKE_NATIVE_UI: '1',
    },
    disableAnimations: true,
    offscreen: true,
  });
  await app.setWindowSize(1024, 768);
  await desktopExpect(app.getByTestId('tester-screen-drag-drop')).toBeVisible();
});

afterAll(() => app?.close());

const log = () => app.getByTestId('drag-log').textContent();

test('a dragged view enters, leaves and drops on a droppable view with its payload', async () => {
  await app.getByTestId('drag-item-beta').dragTo(app.getByTestId('drag-zone'));
  await app.waitForIdle();
  expect(await log()).toBe('start:beta | enter | drop:beta | end:beta:true');
  expect(await app.getByTestId('drag-dropped').textContent()).toBe('beta');
  expect(await app.getByTestId('drag-state').textContent()).toBe('idle');
});

test('a drop on a view that does not take drops ends the drag undropped', async () => {
  await app
    .getByTestId('drag-item-alpha')
    .dragTo(app.getByTestId('drag-refuses'));
  await app.waitForIdle();
  const entries = (await log()).split(' | ');
  expect(entries.slice(-4)).toEqual([
    'start:alpha',
    'enter',
    'leave',
    'end:alpha:false',
  ]);
  expect(await app.getByTestId('drag-dropped').textContent()).toBe('beta');
});

test('a droppable view inside a scroll view takes the drop', async () => {
  await app
    .getByTestId('drag-item-gamma')
    .dragTo(app.getByTestId('drag-row-1'));
  await app.waitForIdle();
  const entries = (await log()).split(' | ');
  expect(entries.slice(-2)).toEqual(['drop-row:1', 'end:gamma:true']);
});

test('a press that does not move far enough is not a drag', async () => {
  const before = await log();
  await app.getByTestId('drag-item-gamma').click();
  await app.waitForIdle();
  expect(await log()).toBe(before);
});

test('holding a drag near the edge of a scroll view scrolls it', async () => {
  const top = async () => {
    const [row] = await app.query('testID', 'drag-row-0', true);
    return row.frame.y;
  };
  const before = await top();
  const [item] = await app.query('testID', 'drag-item-gamma', true);
  const [scroll] = await app.query('testID', 'drag-scroll', true);
  const edge = {
    x: scroll.frame.x + scroll.frame.width / 2,
    y: scroll.frame.y + scroll.frame.height - 8,
  };
  await app.mouseDown({
    x: item.frame.x + 10,
    y: item.frame.y + 10,
  });
  await app.mouseMove({ x: item.frame.x + 40, y: item.frame.y + 30 });
  await app.mouseMove(edge);
  await new Promise(resolve => setTimeout(resolve, 500));
  await app.mouseUp(edge);
  await app.waitForIdle();
  expect(await top()).toBeLessThan(before - 40);
});

test('while a drag is held the preview shows and the droppable view under it is over', async () => {
  const [item] = await app.query('testID', 'drag-item-alpha', true);
  const [zone] = await app.query('testID', 'drag-zone', true);
  await app.mouseDown({ x: item.frame.x + 10, y: item.frame.y + 10 });
  await app.mouseMove({ x: item.frame.x + 40, y: item.frame.y + 20 });
  await app.mouseMove({
    x: zone.frame.x + zone.frame.width / 2,
    y: zone.frame.y + zone.frame.height / 2,
  });
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('drag-preview')).toBeVisible();
  expect(await app.getByTestId('drag-state').textContent()).toMatch(
    /^active over=\d+$/,
  );
  await app.mouseUp({
    x: zone.frame.x + zone.frame.width / 2,
    y: zone.frame.y + zone.frame.height / 2,
  });
  await app.waitForIdle();
  expect(await app.getByTestId('drag-state').textContent()).toBe('idle');
});

test('Escape cancels a drag: the target is left, nothing drops and the state resets', async () => {
  const before = (await log()).split(' | ').length;
  const [item] = await app.query('testID', 'drag-item-beta', true);
  const [zone] = await app.query('testID', 'drag-zone', true);
  const inside = {
    x: zone.frame.x + zone.frame.width / 2,
    y: zone.frame.y + zone.frame.height / 2,
  };
  await app.mouseDown({ x: item.frame.x + 10, y: item.frame.y + 10 });
  await app.mouseMove({ x: item.frame.x + 40, y: item.frame.y + 20 });
  await app.mouseMove(inside);
  await app.waitForIdle();
  expect(await app.getByTestId('drag-state').textContent()).toMatch(/^active/);
  await app.press('escape');
  await app.waitForIdle();
  await app.mouseUp(inside);
  await app.waitForIdle();
  const entries = (await log()).split(' | ').slice(before);
  expect(entries).toEqual(['start:beta', 'enter', 'leave', 'end:beta:false']);
  expect(await app.getByTestId('drag-state').textContent()).toBe('idle');
  await desktopExpect(app.getByTestId('drag-preview')).toBeHidden();
});
