import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import {
  launchApp,
  expectNoA11yViolations,
  expect as desktopExpect,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;
async function launch(
  module: string,
  scenario?: string,
  initialProps: Record<string, unknown> = {},
  // A UI Automation client walks the desktop, so it cannot see an unmapped
  // window: the test that reads the real tree has to ask for a visible one.
  { offscreen = true }: { offscreen?: boolean } = {},
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
      RN_GPUI_WINDOW_STATE: path.resolve(
        `.local/e2e-${module}-${scenario ?? 'default'}.json`,
      ),
    },
    initialProps: { scenario, ...initialProps },
    disableAnimations: true,
    offscreen,
  });
  await app.setWindowSize(1024, 768);
  return app;
}
afterAll(async () => {
  app?.disconnect();
});

async function poll(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
  }
  throw new Error('Native probe condition did not become true');
}

/** Capture smoke checks run only where the platform can render to an image. */
async function expectCaptureSmoke() {
  if (!app.captureSupported) return;
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
}

test('single-line input stays fixed, clips selection, and scrolls with its caret', async () => {
  await launch('SingleLineTextInputFixture');
  const input = app.getByTestId('single-line-input');
  const empty = (await app.query('testID', 'single-line-input', true))[0];
  await input.type('a');
  const firstCharacter = (
    await app.query('testID', 'single-line-input', true)
  )[0];
  expect(firstCharacter.frame).toEqual(empty.frame);
  if (app.captureSupported) {
    fs.writeFileSync(
      path.resolve('.local/single-line-first-character.png'),
      await app.screenshot(),
    );
  }

  const longValue =
    'A deliberately long single-line value that exceeds the input viewport';
  await input.clear();
  await input.type(longValue);
  await desktopExpect(input).toHaveValue(longValue);
  const longInput = (await app.query('testID', 'single-line-input', true))[0];
  const endProps = (await app.getProps(longInput.tag)) as {
    inputScrollX: number;
    frame: { width: number; height: number };
  };
  expect(endProps.inputScrollX).toBeGreaterThan(0);
  expect(endProps.frame.width).toBe(empty.frame.width);

  await input.press('home');
  expect(
    ((await app.getProps(longInput.tag)) as { inputScrollX: number })
      .inputScrollX,
  ).toBe(0);
  await input.press('end');
  const atEnd = (await app.getProps(longInput.tag)) as { inputScrollX: number };
  expect(atEnd.inputScrollX).toBeGreaterThan(0);
  await input.scroll(80, 0);
  const manuallyScrolled = (await app.getProps(longInput.tag)) as {
    inputScrollX: number;
  };
  expect(manuallyScrolled.inputScrollX).toBeLessThan(atEnd.inputScrollX);

  await input.press('mod-a');
  const selected = (await app.getProps(longInput.tag)) as {
    selection: { start: number; end: number };
  };
  expect(selected.selection.start).toBe(0);
  expect(selected.selection.end).toBe(longValue.length);
  if (app.captureSupported) {
    fs.writeFileSync(
      path.resolve('.local/single-line-select-all.png'),
      await app.screenshot(),
    );
  }
});

test('PanResponder moves its view in both axes and releases', async () => {
  await launch('PanResponderFixture');
  const source = (await app.query('testID', 'pan-source', true))[0];
  await app.getByTestId('pan-source').dragTo(app.getByTestId('pan-target'));
  await desktopExpect(app.getByText('Released')).toBeVisible();
  const moved = (await app.query('testID', 'pan-source', true))[0];
  expect(moved.frame.x).toBeGreaterThan(source.frame.x + 100);
  expect(moved.frame.y).toBeGreaterThan(source.frame.y + 30);
});

test('native gestures update UI worklets while JS is busy', async () => {
  await launch('GestureFixture');
  const tap = (await app.query('testID', 'gesture-tap', true))[0];
  const hold = (await app.query('testID', 'gesture-hold', true))[0];
  const busy = (await app.query('testID', 'gesture-busy', true))[0];
  await app.click(busy.tag);
  await poll(async () => app.readLogs().includes('[gesture] JS blocked begin'));
  await app.click(tap.tag);
  await poll(
    async () =>
      ((await app.getProps(tap.tag)) as { opacity: number }).opacity === 0.5,
    1000,
  );
  expect(
    (await app.idleStatus()).busySources.some(source => source.source === 'js'),
  ).toBe(true);
  await app.waitForIdle();
  const point = { x: hold.frame.x + 40, y: hold.frame.y + 30 };
  await app.mouseDown(point);
  try {
    await poll(
      async () =>
        ((await app.getProps(hold.tag)) as { opacity: number }).opacity === 0.5,
    );
  } finally {
    await app.mouseUp(point);
  }
  await app.waitForIdle();
  const before = (await app.query('testID', 'gesture-pan', true))[0];
  await app
    .getByTestId('gesture-pan')
    .dragTo(app.getByTestId('gesture-target'));
  const after = (await app.query('testID', 'gesture-pan', true))[0];
  expect(after.frame.x).toBeGreaterThan(before.frame.x + 100);
  expect(after.frame.y).toBeGreaterThan(before.frame.y + 30);
});

test('retained static siblings do not render with changing siblings', async () => {
  await launch('RetentionFixture');
  const sibling = (await app.query('testID', 'retention-static', true))[0];
  await poll(
    async () =>
      Number(
        (await app.getByTestId('retention-step').textContent()).replace(
          'Step ',
          '',
        ),
      ) >= 3,
  );
  const before = (await app.getProps(sibling.tag)) as { renderCount: number };
  await desktopExpect(app.getByTestId('retention-step')).toHaveText('Step 10');
  const after = (await app.getProps(sibling.tag)) as { renderCount: number };
  expect(after.renderCount).toBe(before.renderCount);
});

test.each(['stack', 'native-stack'])(
  '%s supports consecutive pushes and BackHandler pops',
  async scenario => {
    await launch('NavigationFixture', scenario);
    await app.getByText('Open details').click();
    await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
    await app.getByText('Open next detail').click();
    await desktopExpect(app.getByTestId('Details 2-title')).toBeVisible();
    await app.press('escape');
    await app.waitForIdle();
    await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
    await app.press('escape');
    await app.waitForIdle();
    await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
  },
);

// Native accessibility runs where the platform can resolve nodes by testID:
// Native accessibility runs where the platform can resolve nodes by testID:
// macOS always, Windows and Linux when the runner turned it on. macOS needs no
// switch; on the other two the runner reports its decision through
// `RN_GPUI_TEST_NATIVE_A11Y`, and `=0` means it did not — which is what the
// client and the runner already honour, and what this file did not: Windows was
// hardcoded on, so setting the variable to `0` skipped the test in the client
// while this gate still tried to run it.
const nativeA11y =
  process.platform === 'darwin'
    ? true
    : process.platform === 'win32' || process.platform === 'linux'
      ? process.env.RN_GPUI_TEST_NATIVE_A11Y !== '0'
      : false;

test.skipIf(!nativeA11y)(
  'native accessibility exposes labels, roles, state, values and hidden subtrees',
  async () => {
    await launch('AccessibilityFixture');
    await desktopExpect(app.getByTestId('save')).toHaveAccessibleName(
      'Save document',
    );
    await desktopExpect(app.getByTestId('save')).toHaveAccessibleRole('button');
    await desktopExpect(app.getByTestId('switch')).toBeChecked();
    await desktopExpect(app.getByTestId('switch')).toBeSelected();
    await desktopExpect(app.getByTestId('disabled')).toBeDisabled();
    await desktopExpect(app.getByTestId('input')).toHaveAccessibleName(
      'Project name',
    );
    expect(await app.a11yNode('hidden-a11y')).toBeNull();
    const tree = JSON.stringify(await app.a11yTree());
    expect(tree).toContain('67 percent');
    await expectNoA11yViolations(app);
    await app.getByTestId('save').click();
    await expect(expectNoA11yViolations(app)).rejects.toThrow('unnamed-button');
  },
);

// The engine's `Intl` runs on the operating system's ICU: ICU on Windows and
// Linux, libicucore on macOS. Spaces are compared loosely because ICU versions
// disagree on which no-break space goes before "PM" and "€".
test('Intl formats numbers, dates and collation through the system ICU', async () => {
  await launch('IntlFixture');
  const read = async (id: string) =>
    (await app.getByTestId(`intl-${id}`).textContent()).replace(
      /[\s\u00a0\u202f]+/gu,
      ' ',
    );
  const required: Record<string, string> = {
    number: '1,234,567.891',
    currency: '1.234,50 €',
    percent: '25.6%',
    date: 'January 15, 2024',
    collator: 'a,ä,b',
    'to-locale': '1,234.5',
  };
  for (const [id, expected] of Object.entries(required)) {
    expect(await read(id), id).toBe(expected);
  }
  // Hermes implements only part of `Intl`; a newer engine that adds these
  // should update this list and the documentation.
  expect(await read('missing')).toBe(
    'PluralRules,ListFormat,RelativeTimeFormat,Segmenter',
  );
  // Optional formats. Nothing is tolerated yet: the values are printed so the
  // first run on the oldest supported ICU (64.2, Windows 10 1903) names exactly
  // which calls throw and with what message.
  const extras: Record<string, string> = {
    compact: '1.5M',
    'date-fr': 'lundi 15 janvier 2024',
    time: '1:30 PM',
  };
  for (const [id, expected] of Object.entries(extras)) {
    const value = await read(id);
    console.log(`intl ${id} on ${process.platform}: ${value}`);
    expect(value, id).toBe(expected);
  }
});

test.skipIf(!nativeA11y || process.platform === 'darwin')(
  'announceForAccessibility shows a live region that carries the text',
  async () => {
    await launch('AccessibilityFixture');
    await app.getByTestId('announce').click();
    await poll(async () =>
      JSON.stringify(await app.a11yTree()).includes('Announcement API works'),
    );
  },
);

// Windows exposes accessibility through UI Automation, and the driver reads
// GPUI's own copy of the tree, so a break in the AccessKit adapter could leave
// the test above passing while assistive technology sees nothing. This walks the
// real tree of the running process and compares it with what the driver reports.
// Only Windows: macOS and Linux have their own native probes.
test.skipIf(process.platform !== 'win32')(
  'the windows ui automation tree matches what the app reports',
  async () => {
    await launch('AccessibilityFixture', undefined, {}, { offscreen: false });
    // Read the driver's tree first: on Windows this also asks the window for
    // its accessibility provider, which is what makes AccessKit publish.
    const driverTree = (await app.a11yTree()) as {
      nodes?: Record<string, { author_id?: string }>;
    };
    const driverIds = Object.values(driverTree?.nodes ?? {})
      .map(node => node?.author_id)
      .filter((id): id is string => typeof id === 'string');

    const pid = app.pid;
    expect(pid).toBeTypeOf('number');
    const script = path.join(__dirname, 'uia-tree.ps1');
    const raw = execFileSync(
      'pwsh',
      ['-NoProfile', '-File', script, '-ProcessId', String(pid)],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    const nodes: {
      name: string;
      automationId: string;
      controlType: string;
      isEnabled: boolean;
    }[] = JSON.parse(raw);
    const byId = new Map(
      nodes
        .filter(node => node.automationId)
        .map(node => [node.automationId, node]),
    );

    // AccessKit maps the React Native testID to the UIA `AutomationId`, which is
    // what makes a node findable by a client at all.
    for (const id of ['save', 'switch', 'disabled', 'input', 'progress']) {
      expect(byId.has(id), `UIA has no node with AutomationId '${id}'`).toBe(
        true,
      );
      expect(driverIds).toContain(id);
    }
    expect(byId.get('save')?.name).toBe('Save document');
    expect(byId.get('switch')?.name).toBe('Notifications');
    expect(byId.get('input')?.name).toBe('Project name');
    expect(byId.get('save')?.controlType).toBe('Button');
    expect(byId.get('input')?.controlType).toBe('Edit');
    expect(byId.get('progress')?.controlType).toBe('ProgressBar');
    // State crosses the boundary too, not just names.
    expect(byId.get('disabled')?.isEnabled).toBe(false);
    expect(byId.get('save')?.isEnabled).toBe(true);
    // A hidden subtree must not reach the platform: GPUI keeps the node and
    // marks it hidden, and the adapter drops it.
    expect(byId.has('hidden-a11y')).toBe(false);
  },
);

test('tabs preserve text input and list scroll while switching', async () => {
  await launch('NavigationFixture', 'tabs');
  await app.getByRole('tab', { name: 'List' }).click();
  const input = app.getByTestId('navigation-list-input');
  await input.clear();
  await input.type('Retained tab state');
  await app.getByTestId('navigation-list').scroll(0, -400);
  await app.getByRole('tab', { name: 'Home' }).click();
  await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
  await app.getByRole('tab', { name: 'List' }).click();
  await desktopExpect(input).toHaveValue('Retained tab state');
  expect(app.readLogs()).toContain('scroll offset=400');
});

test('drawer closes through BackHandler and keeps route content clickable', async () => {
  await launch('NavigationFixture', 'drawer');
  await app.getByRole('button', { name: 'Show navigation menu' }).click();
  await app.getByRole('button', { name: 'List' }).click();
  await desktopExpect(app.getByText('Long list + input')).toBeVisible();
  await app.getByRole('button', { name: 'Show navigation menu' }).click();
  await app.press('mod-[');
  await app.waitForIdle();
  await app.getByTestId('navigation-list-input').type(' drawer');
  await desktopExpect(app.getByTestId('navigation-list-input')).toContainText(
    'drawer',
  );
});

test.each([
  'native-stack-modal',
  'native-stack-transparent-modal',
  'native-stack-hidden',
])('%s preserves underlying screen and dismisses', async scenario => {
  await launch('NavigationFixture', scenario);
  await app.getByText('Open details').click();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
  await app.press('escape');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
});

test("the module's back button pops the stack", async () => {
  // `native-stack-native-back` is the one scenario that does not replace the
  // back button with a JS `headerLeft`, so a click on `‹` can only reach the
  // button the module paints. The other scenarios would pass this test with the
  // button missing entirely.
  await launch('NavigationFixture', 'native-stack-native-back');
  await app.getByText('Open details').click();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
  // There is no React node for a painted button, so the click goes by position:
  // the module puts it at the header's left edge, 56x56, below the window's top
  // inset. y = 40 is inside it with no inset and with a transparent title bar's.
  await app.mouseDown({ x: 28, y: 40 });
  await app.mouseUp({ x: 28, y: 40 });
  await app.waitForIdle();
  // The navigator answers `onHeaderBackButtonClicked` by dispatching a pop, and
  // React Native declares that event on `RNSScreen`. A dispatch to the header
  // config is dropped, so nothing pops and this screen stays.
  await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeHidden();
});

test('a modal sheet paints a backdrop and a sheet over the screen underneath', async () => {
  await launch('NavigationFixture', 'native-stack-modal');
  await app.getByText('Open details').click();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
  // The sheet is painted inside the screen, so the test driver's frames — which
  // report the Yoga origin — cannot see where it landed. Read the pixels instead.
  if (!app.captureSupported) return;
  const image = PNG.sync.read(await app.screenshot());
  const pixel = (x: number, y: number) => {
    const offset = (image.width * y + x) * 4;
    return {
      r: image.data[offset],
      g: image.data[offset + 1],
      b: image.data[offset + 2],
    };
  };
  // The sheet is centred in the screen and capped at 760x640, so the middle of
  // the capture is inside it whatever the window size. It paints 0xff171923.
  const centre = pixel(
    Math.floor(image.width / 2),
    Math.floor(image.height / 2),
  );
  expect(Math.abs(centre.r - 0x17)).toBeLessThanOrEqual(0x0a);
  expect(Math.abs(centre.g - 0x19)).toBeLessThanOrEqual(0x0a);
  expect(Math.abs(centre.b - 0x23)).toBeLessThanOrEqual(0x0a);
  // A corner is outside the sheet. What it holds differs by platform — the
  // menu bar on Linux, the window frame on Windows — so this asserts that it is
  // *not* the sheet rather than naming a colour, which is enough to fail a
  // window that painted one flat colour.
  const corner = pixel(4, 4);
  const differs =
    Math.abs(corner.r - centre.r) > 0x10 ||
    Math.abs(corner.g - centre.g) > 0x10 ||
    Math.abs(corner.b - centre.b) > 0x10;
  expect(differs).toBe(true);
});

test('native FullWindowOverlay renders above the application', async () => {
  await launch('NavigationFixture', 'native-stack-overlay');
  await desktopExpect(
    app.getByText('Full window overlay above the app'),
  ).toBeVisible();
  await desktopExpect(
    app.getByText('Navigation content behind overlay'),
  ).toBeVisible();
});

test('pointer buttons, click count and modifier keys use the focused input', async () => {
  await launch('NavigationFixture', 'stack');
  const input = app.getByTestId('e2e-text-input');
  await input.type('Café 👋');
  await input.doubleClick();
  const match = (await input.all())[0];
  expect(
    (
      (await app.getProps(match.tag)) as {
        selection: { start: number; end: number };
      }
    ).selection,
  ).toEqual({ start: 0, end: 'Café 👋'.length });
  await input.press('mod-a');
  await input.press('backspace');
  await desktopExpect(input).toHaveValue('');
  await input.type('abcd');
  await input.press('shift-left');
  await input.press('backspace');
  await desktopExpect(input).toHaveValue('abc');
  await input.rightClick();
  await input.click({ button: 'middle' });
  await desktopExpect(input).toHaveValue('abc');
});

test('mouse back and forward restore stack history', async () => {
  await launch('NavigationFixture', 'stack');
  await app.getByText('Open details').click();
  await app.mouseDown({ x: 10, y: 10 }, { button: 'back' });
  await app.mouseUp({ x: 10, y: 10 }, { button: 'back' });
  await app.waitForIdle();
  expect(app.readLogs()).toContain('[nav] stack state route=Home title=Home');
  await app.mouseDown({ x: 10, y: 10 }, { button: 'forward' });
  await app.mouseUp({ x: 10, y: 10 }, { button: 'forward' });
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
  expect(app.readLogs()).toContain(
    '[navigation] emitted hardwareForwardPress from mouse button',
  );
});

test('keyboard back and forward survive consecutive route changes', async () => {
  await launch('NavigationFixture', 'stack');
  await app.getByText('Open details').click();
  await app.press('mod-[');
  await app.waitForIdle();
  await app.press('mod-]');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
  expect(app.readLogs()).toContain(
    '[navigation] emitted hardwareForwardPress from keyboard',
  );
});

test('native stack slide, none and fade modes finish and pop all routes', async () => {
  await launch('NavigationFixture', 'native-stack');
  await app.setAnimationsEnabled(true);
  await app.getByText('Open details').click();
  for (const id of [2, 3, 4]) {
    await app.getByTestId(`details-${id - 1}-next`).click();
    await desktopExpect(app.getByTestId(`Details ${id}-title`)).toBeVisible();
  }
  for (const id of [3, 2, 1]) {
    await app.press('escape');
    await app.waitForIdle();
    await desktopExpect(app.getByTestId(`Details ${id}-title`)).toBeVisible();
  }
  await app.press('escape');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
  expect(app.readLogs()).toContain(
    '[nav-native] transition end route=Details closing=true',
  );
});

test('one Escape dismisses one screen exactly once', async () => {
  // Escape runs the dismissal animation itself and then tells JavaScript, which
  // pops the screen. When the pop batch arrived, the flag that says "this
  // dismissal already animated" had already been cleared, so the removal ran a
  // second exit from the rest pose: the card came back and left again, and both
  // lifecycle halves fired twice. Count them, against a log that names the tag.
  // The fixture logs a `[nav-native]` pair per transition, which is the part of
  // the dismissal JavaScript observes. The lifecycle events drive those.
  await launch('NavigationFixture', 'native-stack');
  await app.setAnimationsEnabled(true);
  await app.getByText('Open details').click();
  await desktopExpect(app.getByTestId('Details 1-title')).toBeVisible();
  // The push logs its own transition start after the screen is visible.
  await expect
    .poll(() => app.readLogs())
    .toContain('[nav-native] transition end route=Details closing=false');
  const before = app.readLogs().length;
  await app.press('escape');
  await app.waitForIdle();
  await desktopExpect(app.getByTestId('Home-title')).toBeVisible();
  const after = app.readLogs().slice(before);
  const starts = [
    ...after.matchAll(/\[nav-native\] transition start route=Details/gu),
  ];
  const ends = [
    ...after.matchAll(/\[nav-native\] transition end route=Details/gu),
  ];
  expect(starts).toHaveLength(1);
  expect(ends).toHaveLength(1);
  // And the screen really is gone, rather than animating away and back.
  await desktopExpect(app.getByTestId('Details 1-title')).toBeHidden();
});

test('nested stack and modal preserve the tab input and scroll position', async () => {
  await launch('NavigationFixture', 'nested');
  await app.getByRole('tab', { name: 'List' }).click();
  const input = app.getByTestId('navigation-list-input');
  await input.clear();
  await input.type('Nested state');
  await app.getByTestId('navigation-list').scroll(0, -400);
  await app.getByText('Open modal').click();
  await desktopExpect(app.getByTestId('Modal-title')).toBeVisible();
  await app.press('mod-[');
  await app.waitForIdle();
  await desktopExpect(input).toHaveValue('Nested state');
  expect(app.readLogs()).toContain('scroll offset=400');
});

test('duplicate identifiers fail accessibility and ambiguous action checks', async () => {
  await launch('AccessibilityFixture', undefined, { duplicate: true });
  // The duplicate-testID audit runs over the native tree, which only exists
  // where the platform can resolve nodes (macOS, or Linux with AT-SPI enabled);
  // the ambiguous-action check is RN-side and always runs.
  if (app.nativeA11ySupported) {
    await expect(expectNoA11yViolations(app)).rejects.toThrow(
      'Duplicate visible testID "duplicate"',
    );
  }
  await expect(app.getByTestId('duplicate').click()).rejects.toThrow(
    'matched 2 nodes',
  );
});

test('hidden windows resize, capture and receive keyboard input', async () => {
  await launch('NavigationFixture', 'stack');
  await app.setWindowSize(640, 480);
  await app.focusWindow();
  expect(await app.getWindowSize()).toEqual({ width: 640, height: 480 });
  expect((await app.getWindowBounds()).hidden).toBe(
    process.env.RN_GPUI_TEST_HEADED !== '1',
  );
  await app.getByTestId('e2e-text-input').type('Hidden window input');
  await desktopExpect(app.getByTestId('e2e-text-input')).toHaveValue(
    'Hidden window input',
  );
  await expectCaptureSmoke();
});

test('bundled and data URI images resolve and occupy their declared frames', async () => {
  await launch('ImageFixture');
  for (const mode of ['cover', 'contain', 'stretch', 'center', 'data-uri']) {
    const image = (await app.query('testID', `image-${mode}`, true))[0];
    expect(image?.visible).toBe(true);
    expect(image?.frame.width).toBeGreaterThan(100);
    expect(image?.frame.height).toBeGreaterThan(60);
    const props = (await app.getProps(image.tag)) as {
      imageUri: string;
      imageResizeMode: string;
    };
    expect(props.imageUri.length).toBeGreaterThan(0);
    if (mode !== 'data-uri') expect(props.imageResizeMode).toBe(mode);
  }
  await expectCaptureSmoke();
});

test('Text layout preserves explicit line breaks and accented content', async () => {
  await launch('TextFixture');
  const paragraph = app.getByTestId('text-hard-break');
  await desktopExpect(paragraph).toContainText('First line: gjpqy ÁÉÅ');
  await desktopExpect(paragraph).toContainText('Second line: café naïve');
  await expectCaptureSmoke();
});

test('per-edge borders and outlines retain their layout frames', async () => {
  await launch('BorderFixture');
  for (const id of ['per-side-solid', 'dashed-border', 'dotted-outline']) {
    await desktopExpect(app.getByTestId(id)).toBeVisible();
    const node = (await app.query('testID', id, true))[0];
    expect(node.frame.width).toBeGreaterThan(200);
    expect(node.frame.height).toBeGreaterThan(60);
    const props = (await app.getProps(node.tag)) as {
      borderWidths: {
        left: number;
        top: number;
        right: number;
        bottom: number;
      };
      outlineWidth: number;
    };
    if (id === 'per-side-solid')
      expect(props.borderWidths).toEqual({
        left: 6,
        top: 4,
        right: 8,
        bottom: 3,
      });
    if (id === 'dotted-outline') expect(props.outlineWidth).toBe(3);
  }
  await expectCaptureSmoke();
});

test('overflow: hidden clips children to the rounded corners', async () => {
  await launch('BorderFixture');
  if (!app.captureSupported) return;
  const probes = [
    ['rounded-clip', [0xef, 0x44, 0x44]],
    ['rounded-scroll', [0x25, 0x63, 0xeb]],
  ] as const;
  await expectRoundedCorners(probes);
  // A scrolled container is drawn through a composited layer, which has to
  // keep the rounded clip it is composited under.
  const [scroll] = await app.query('testID', 'rounded-scroll', true);
  await app.hover(scroll.tag);
  for (let step = 0; step < 4; step++) await app.scroll(scroll.tag, 0, -60);
  await app.waitForIdle({ ignore: ['timers', 'frames'] }).catch(() => {});
  await expectRoundedCorners(probes.slice(1));
});

async function expectRoundedCorners(
  probes: ReadonlyArray<readonly [string, readonly number[]]>,
) {
  for (const [id, fill] of probes) {
    // The element's own capture: the window cropped to its frame, wherever
    // the platform puts the surface in the window (a Linux menu bar sits
    // above it).
    const { tag } = (await app.query('testID', id, true))[0];
    const image = PNG.sync.read(await app.screenshot(tag));
    const pixel = (x: number, y: number) => {
      const offset = (image.width * Math.round(y) + Math.round(x)) * 4;
      return [
        image.data[offset],
        image.data[offset + 1],
        image.data[offset + 2],
      ];
    };
    const expectNear = (x: number, y: number, expected: readonly number[]) => {
      const actual = pixel(x, y);
      if (actual.some((value, index) => Math.abs(value - expected[index]) > 12))
        throw new Error(
          `${id} (${Math.round(x)}, ${Math.round(y)}) of ${image.width}x${image.height} is ${actual}, expected ${expected}`,
        );
    };
    const scale = app.scale;
    const right = image.width - 1;
    const bottom = image.height - 1;
    // Two points in from a corner is inside the box but outside a 24pt
    // radius, so the page shows through there.
    const inset = 2 * scale;
    expectNear(inset, inset, [0xff, 0xff, 0xff]);
    expectNear(right - inset, inset, [0xff, 0xff, 0xff]);
    expectNear(inset, bottom - inset, [0xff, 0xff, 0xff]);
    expectNear(right - inset, bottom - inset, [0xff, 0xff, 0xff]);
    expectNear(right / 2, bottom / 2, fill);
    // The straight edges are not cut.
    expectNear(right / 2, scale, fill);
  }
}

test('Appearance.setColorScheme updates the rendered React Native state', async () => {
  await launch('AppearanceFixture');
  const status = app.getByTestId('appearance-status');
  const text = await status.textContent();
  const targetScheme = text.includes('dark') ? 'light' : 'dark';
  const before = (await app.query('testID', 'appearance-root', true))[0];
  const backgroundBefore = (await app.getProps(before.tag)) as {
    backgroundColor: number;
  };
  await app.getByTestId('appearance-toggle').click();
  await desktopExpect(status).toContainText(`Appearance: ${targetScheme}`);
  const after = (await app.query('testID', 'appearance-root', true))[0];
  const backgroundAfter = (await app.getProps(after.tag)) as {
    backgroundColor: number;
  };
  expect(backgroundAfter.backgroundColor).not.toBe(
    backgroundBefore.backgroundColor,
  );
  await expectCaptureSmoke();
});

test('font loading registers Inter and renders alongside system weights', async () => {
  await launch('GPUIFontFixture');
  await desktopExpect(app.getByTestId('font-load-status')).toContainText(
    'Inter loaded',
  );
  for (const weight of [400, 600, 800]) {
    await desktopExpect(app.getByTestId(`system-font-${weight}`)).toBeVisible();
    await desktopExpect(app.getByTestId(`inter-font-${weight}`)).toBeVisible();
    const [system, inter] = await Promise.all([
      app.query('testID', `system-font-${weight}`, true),
      app.query('testID', `inter-font-${weight}`, true),
    ]);
    const systemProps = (await app.getProps(system[0].tag)) as {
      paragraphFragments: { fontFamily: string; fontWeight: number }[];
    };
    const interProps = (await app.getProps(inter[0].tag)) as typeof systemProps;
    expect(systemProps.paragraphFragments[0].fontWeight).toBe(weight);
    expect(interProps.paragraphFragments[0].fontFamily).toBe('Inter');
    expect(interProps.paragraphFragments[0].fontWeight).toBe(weight);
  }
  await expectCaptureSmoke();
});

test('SVG primitives, SvgXml and remote SvgUri render from an SVG response', async () => {
  await launch('GPUISvgFixture');
  await desktopExpect(app.getByTestId('svg-title')).toBeVisible();
  await desktopExpect(app.getByTestId('svg-uri-status')).toContainText(
    'Remote SvgUri loaded',
  );
  const tree = JSON.stringify(await app.tree());
  expect(tree).toContain('React Native SVG');
  // The fixture declares every SVG at 180x120. A renderer that returns its
  // element without a box leaves it an unpositioned flow child, and an image with
  // no intrinsic size fills its parent — the SVGs then paint over the label
  // below them. Asserting the frame is what catches that; the test above only
  // proves something was painted.
  const uriImage = (await app.query('testID', 'svg-uri-image', true))[0];
  expect(uriImage?.frame?.width).toBe(180);
  expect(uriImage?.frame?.height).toBe(120);
  await expectCaptureSmoke();
});

test('Platform.constants reports the active JS engine package', async () => {
  await launch('CoreModulesFixture');
  // The engine is a property of the installed package, not of the test, so the
  // expectation comes from the same override that selects it at run time.
  const expectedEngine = process.env.RN_GPUI_JS_ENGINE || 'hermes';
  const name = (await app.query('testID', 'core-js-engine', true))[0];
  expect(name?.text).toBe(`JS engine: ${expectedEngine}`);
  const version = (
    await app.query('testID', 'core-js-engine-version', true)
  )[0];
  expect(version?.text).toMatch(/^JS engine version: \S/u);
  expect(version?.text).not.toContain('unknown');
});

test('the file system module reads, writes and watches real files', async () => {
  await launch('GPUIFileSystemFixture');
  await desktopExpect(app.getByTestId('fs-title')).toBeVisible();
  // Every line the fixture prints is a distinct claim; asserting them individually
  // is what turns "the screen rendered" into "the module worked". The fixture
  // records `BAD`, `MISMATCH`, `TIMEOUT` or `FAILED` in the line itself when a
  // step goes wrong, so the substring check is exact rather than approximate.
  await desktopExpect(app.getByTestId('fs-title')).toContainText('File system');
  const tree = JSON.stringify(await app.tree());
  for (const expected of [
    'text ok',
    'binary ok',
    'stat file size=',
    'readdir bytes.bin,note.txt',
    'recursive ok',
    'sync exists',
    'syncRead ok',
    'enoent ok',
    'handleRead ok',
    'handleWrite ok',
    'writeOffset ok',
    'range ok',
    'rangeCursor ok',
    'watch ok',
    'copy ok',
    'paths ok',
    'dialog ok',
  ]) {
    expect(tree).toContain(expected);
  }
  // A directory link needs the symlink privilege on Windows. Where the platform
  // refuses it, the step is skipped with Node's EPERM, as the fixture documents.
  expect(tree).toMatch(/symlinkDir (ok|skipped EPERM)/u);
  for (const failure of ['MISMATCH', 'BAD', 'TIMEOUT', 'FAILED']) {
    expect(tree).not.toContain(failure);
  }
  await expectCaptureSmoke();
});

test('the notifications module shows, schedules, repeats and cancels', async () => {
  await launch('GPUINotificationsFixture');
  await desktopExpect(app.getByTestId('notifications-title')).toContainText(
    'Notifications',
  );
  await desktopExpect(app.getByText('settings ok')).toBeVisible(20000);
  const tree = JSON.stringify(await app.tree());
  for (const expected of [
    'permission ok',
    'show ok',
    'generatedId ok',
    'scheduled ok',
    'fired ok',
    'oneShotRemoved ok',
    'pastRejected ok',
    'repeat ok',
    'cancelScheduled ok',
    'cancel ok',
    'cancelAll ok',
    'displayed ok',
    'initialEvent ok',
  ]) {
    expect(tree).toContain(expected);
  }
  expect(tree).not.toContain('BAD');
  expect(tree).not.toContain('FAILED');
  expect(tree).not.toContain('TIMEOUT');
});

test('the file system module downloads, reports progress and aborts', async () => {
  const size = 3 * 1024 * 1024;
  const body = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) body[i] = i % 251;

  const sockets = new Set<import('node:net').Socket>();
  const server = http.createServer((request, response) => {
    const route = request.url ?? '/';
    if (route === '/file') {
      response.setHeader('content-length', String(size));
      response.end(body);
    } else if (route === '/chunked') {
      response.write(body.subarray(0, size / 2));
      setTimeout(() => response.end(body.subarray(size / 2)), 30);
    } else if (route === '/redirect') {
      response.statusCode = 302;
      response.setHeader('location', '/file');
      response.end();
    } else if (route === '/echo') {
      response.end(
        JSON.stringify({ method: request.method, headers: request.headers }),
      );
    } else if (route === '/short') {
      response.setHeader('content-length', String(size));
      response.write(body.subarray(0, 1000));
      setTimeout(() => response.destroy(), 50);
    } else if (route === '/slow') {
      response.setHeader('content-length', String(size));
      const timer = setInterval(
        () => response.write(body.subarray(0, 16384)),
        40,
      );
      response.on('close', () => clearInterval(timer));
    } else if (route === '/stall') {
      response.setHeader('content-length', String(size));
      response.write(body.subarray(0, 100));
    } else {
      response.statusCode = 404;
      response.end('nothing here');
    }
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    await launch('GPUIDownloadFixture', undefined, { server: url });
    await desktopExpect(app.getByText('done ok')).toBeVisible(60000);
    const tree = JSON.stringify(await app.tree());
    for (const expected of [
      'basic ok',
      'content ok',
      'noPartial ok',
      'progress ok',
      'chunked ok',
      'redirect ok',
      'request ok',
      'httpError ok',
      'keepsExisting ok',
      'incomplete ok',
      'noDirectory ok',
      'abort ok',
      'abortStalled ok',
      'preAborted ok',
    ]) {
      expect(tree).toContain(expected);
    }
    expect(tree).not.toContain('BAD');
    expect(tree).not.toContain('FAILED');
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('the system module controls login items and screen-capture protection', async () => {
  await launch('GPUISystemFixture', undefined, {});
  await desktopExpect(app.getByText('done ok')).toBeVisible(30000);
  const tree = JSON.stringify(await app.tree());
  for (const expected of [
    'loginOff ok',
    'loginOn ok',
    'loginReplace ok',
    'loginOffAgain ok',
    'loginTwice ok',
    'protectionOff ok',
    'protectionOn ok',
    'protectionLater ok',
    'protectionOffAgain ok',
  ]) {
    expect(tree).toContain(expected);
  }
  expect(tree).not.toContain('BAD');
  expect(tree).not.toContain('FAILED');
});

test('the webauthn module registers a resident credential and derives the same PRF secret twice', async () => {
  await launch('GPUIWebauthnFixture');
  await desktopExpect(app.getByText('done ok')).toBeVisible(30000);
  const tree = JSON.stringify(await app.tree());
  for (const expected of [
    'available ok',
    'noPin ok',
    'wrongPin ok',
    'register ok',
    'prfSame ok',
    'prfSalt ok',
    'unknown ok',
    'touch ok',
  ]) {
    expect(tree).toContain(expected);
  }
  expect(tree).not.toContain('BAD');
  expect(tree).not.toContain('FAILED');
});

test('the system module restarts the app with new arguments', async () => {
  const marker = `restart-${Date.now()}`;
  const running = () =>
    execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
      .split('\n')
      .filter(line => line.includes(`--restart-marker=${marker}`))
      .map(line => Number(line.trim().split(/\s+/)[0]))
      .filter(pid => pid !== process.pid);

  await launch('GPUISystemFixture', undefined, { restartMarker: marker });
  await desktopExpect(app.getByText('done ok')).toBeVisible(30000);
  expect(running()).toHaveLength(0);
  app
    .getByTestId('system-restart')
    .click()
    .catch(() => {});

  const deadline = Date.now() + 20000;
  let started: number[] = [];
  while (Date.now() < deadline && started.length === 0) {
    started = running();
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The copy may already have exited.
    }
  }
  expect(started.length).toBeGreaterThan(0);
});

test('an app started with --hidden opens without showing its window', async () => {
  const visibleWindows = (pid: number) =>
    Number(
      execFileSync(
        'osascript',
        [
          '-l',
          'JavaScript',
          '-e',
          `ObjC.import('CoreGraphics'); const pid = ${pid};
           const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)));
           list.filter(w => w.kCGWindowOwnerPID === pid && w.kCGWindowLayer === 0 && w.kCGWindowBounds.Width > 100).length`,
        ],
        { encoding: 'utf8' },
      ).trim(),
    );
  const bundle = path.resolve(
    'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
  );
  const start = async (args: string[]) =>
    launchApp({
      bundle,
      env: {
        RN_GPUI_MODULE: 'GPUISystemFixture',
        RN_GPUI_BUNDLE: bundle,
        RN_GPUI_DEV_PORT: '1',
        RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-hidden-start.json'),
      },
      args,
      initialProps: { idle: true },
      disableAnimations: true,
      offscreen: false,
    });

  const shown = await start([]);
  try {
    const deadline = Date.now() + 15000;
    while (visibleWindows(shown.pid as number) !== 1) {
      expect(Date.now()).toBeLessThan(deadline);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    await shown.close();
  }

  const hidden = await start(['--hidden']);
  try {
    await desktopExpect(hidden.getByTestId('system-title')).toBeVisible(30000);
    for (let i = 0; i < 20; i += 1) {
      expect(visibleWindows(hidden.pid as number)).toBe(0);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    await hidden.close();
  }
});

type Channel = {
  version?: string;
  file?: string;
  body?: Buffer;
  sha512?: string;
  releaseDate?: string;
  noZip?: boolean;
  slow?: boolean;
};

function sha512Base64(data: Buffer) {
  return crypto.createHash('sha512').update(data).digest('base64');
}

async function serveFeed(channels: Record<string, Channel>) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const feed = /^\/feed\/([a-z]+)-mac\.yml$/.exec(url.pathname);
    if (feed) {
      const channel = channels[feed[1]];
      if (!channel) {
        response.statusCode = 404;
        response.end('no such channel');
        return;
      }
      const body = channel.body as Buffer;
      const digest = channel.sha512 ?? sha512Base64(body);
      const files = channel.noZip
        ? `  - url: App-${channel.version}.dmg\n    sha512: ${digest}\n    size: 10\n`
        : `  - url: ${channel.file}\n    sha512: ${digest}\n    size: ${body.length}\n`;
      response.end(
        `version: ${channel.version}\nfiles:\n${files}releaseDate: '${channel.releaseDate ?? '2026-01-02T03:04:05.000Z'}'\n`,
      );
      return;
    }
    const file = /^\/feed\/(.+)$/.exec(url.pathname);
    const owner = Object.values(channels).find(
      c => c.file === decodeURIComponent(file?.[1] ?? ''),
    );
    if (!owner) {
      response.statusCode = 404;
      response.end();
      return;
    }
    const body = owner.body as Buffer;
    response.setHeader('content-length', String(body.length));
    if (!owner.slow) {
      response.end(body);
      return;
    }
    let offset = 0;
    const timer = setInterval(() => {
      if (offset >= body.length) {
        clearInterval(timer);
        response.end();
        return;
      }
      response.write(body.subarray(offset, offset + 65536));
      offset += 65536;
    }, 30);
    response.on('close', () => clearInterval(timer));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed`,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

test('the updater checks, downloads and verifies updates', async () => {
  const body = crypto.randomBytes(3 * 1024 * 1024);
  const feed = await serveFeed({
    same: { version: '1.0.0', file: 'same.zip', body },
    newer: { version: '1.1.0', file: 'App-1.1.0-mac.zip', body },
    older: { version: '0.9.0', file: 'older.zip', body },
    badsum: {
      version: '1.2.0',
      file: 'bad.zip',
      body,
      sha512: sha512Base64(Buffer.from('other')),
    },
    nozip: { version: '1.5.0', file: 'x.zip', body, noZip: true },
    slow: {
      version: '1.3.0',
      file: 'slow.zip',
      body: crypto.randomBytes(24 * 1024 * 1024),
      slow: true,
    },
  });
  try {
    await launch('GPUIUpdaterFixture', undefined, {
      feedUrl: feed.url,
      currentVersion: '1.0.0',
      mode: 'check',
    });
    await desktopExpect(app.getByText('done ok')).toBeVisible(90000);
    const tree = JSON.stringify(await app.tree());
    for (const expected of [
      'version ok',
      'notAvailable ok',
      'available ok',
      'download ok',
      'downgrade ok',
      'checksum ok',
      'noArchive ok',
      'feedError ok',
      'cancel ok',
      'idle ok',
      'install ok',
    ]) {
      expect(tree).toContain(expected);
    }
    expect(tree).not.toContain('BAD');
    expect(tree).not.toContain('FAILED');
  } finally {
    await feed.close();
  }
}, 120000);

test.skipIf(process.platform !== 'darwin')(
  'the updater replaces the app bundle it runs from',
  async () => {
    const binary = process.env.RN_GPUI_TEST_BINARY as string;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-e2e-'));
    const makeApp = (directory: string, version: string) => {
      const app = path.join(directory, 'Updatable.app');
      fs.mkdirSync(path.join(app, 'Contents/MacOS'), { recursive: true });
      fs.copyFileSync(binary, path.join(app, 'Contents/MacOS/rn-gpui-tester'));
      fs.chmodSync(path.join(app, 'Contents/MacOS/rn-gpui-tester'), 0o755);
      fs.writeFileSync(
        path.join(app, 'Contents/Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>rn-gpui-tester</string>
<key>CFBundleIdentifier</key><string>org.reactnativegpui.updater-e2e</string>
<key>CFBundleName</key><string>Updatable</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
</dict></plist>`,
      );
      execFileSync('codesign', ['--force', '--sign', '-', app]);
      return app;
    };
    const installed = makeApp(path.join(root, 'installed'), '1.0.0');
    const next = makeApp(path.join(root, 'next'), '2.0.0');
    const archive = path.join(root, 'Updatable-2.0.0-mac.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', next, archive]);
    const feed = await serveFeed({
      install: {
        version: '2.0.0',
        file: 'Updatable-2.0.0-mac.zip',
        body: fs.readFileSync(archive),
      },
    });
    const bundle = path.resolve(
      'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
    );
    let running: DesktopApp | undefined;
    try {
      running = await launchApp({
        executable: path.join(installed, 'Contents/MacOS/rn-gpui-tester'),
        bundle,
        env: {
          RN_GPUI_MODULE: 'GPUIUpdaterFixture',
          RN_GPUI_BUNDLE: bundle,
          RN_GPUI_DEV_PORT: '1',
          RN_GPUI_WINDOW_STATE: path.resolve('.local/e2e-updater-install.json'),
        },
        initialProps: { feedUrl: feed.url, mode: 'install' },
        disableAnimations: true,
        offscreen: true,
      });
      await desktopExpect(running.getByText('downloaded')).toBeVisible(60000);
      const version = () =>
        execFileSync(
          '/usr/libexec/PlistBuddy',
          [
            '-c',
            'Print :CFBundleShortVersionString',
            path.join(installed, 'Contents/Info.plist'),
          ],
          { encoding: 'utf8' },
        ).trim();
      expect(version()).toBe('1.0.0');
      running
        .getByTestId('updater-install')
        .click()
        .catch(() => {});
      const deadline = Date.now() + 60000;
      while (version() !== '2.0.0' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      expect(version()).toBe('2.0.0');
      expect(fs.existsSync(`${installed}.old`)).toBe(false);
      execFileSync('codesign', ['--verify', '--deep', '--strict', installed]);
    } finally {
      running?.disconnect();
      try {
        execFileSync('pkill', ['-f', root]);
      } catch {
        // Nothing of the relaunched copy is running.
      }
      await feed.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  180000,
);

test('the image manipulator crops, resizes and encodes, and the result shows as a data URI', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manipulator-e2e-'));
  const source = path.join(directory, 'quadrants.png');
  const picture = new PNG({ width: 400, height: 300 });
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  for (let y = 0; y < 300; y += 1) {
    for (let x = 0; x < 400; x += 1) {
      const [r, g, b] = colours[(y >= 150 ? 2 : 0) + (x >= 200 ? 1 : 0)];
      picture.data.set([r, g, b, 255], (y * 400 + x) * 4);
    }
  }
  fs.writeFileSync(source, PNG.sync.write(picture));

  const at = async (testID: string, x: number, y: number) => {
    const image = PNG.sync.read(await app.getByTestId(testID).screenshot());
    const px = Math.min(image.width - 1, Math.round(image.width * x));
    const py = Math.min(image.height - 1, Math.round(image.height * y));
    const offset = (py * image.width + px) * 4;
    return Array.from(image.data.subarray(offset, offset + 3));
  };
  const near = (actual: number[], expected: number[], tolerance = 40) =>
    actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);

  // An image paints once its decode finishes, a moment after its node exists.
  const colour = async (
    testID: string,
    x: number,
    y: number,
    expected: number[],
  ) => {
    const deadline = Date.now() + 5000;
    let actual = await at(testID, x, y);
    while (!near(actual, expected) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      actual = await at(testID, x, y);
    }
    expect(
      near(actual, expected),
      `${testID} at ${x},${y} is ${actual}, expected ${expected}`,
    ).toBe(true);
  };

  try {
    await launch('GPUIImageManipulatorFixture', undefined, { source });
    await desktopExpect(app.getByText('done ok')).toBeVisible(30000);
    const tree = JSON.stringify(await app.tree());
    for (const expected of [
      'size ok',
      'crop ok',
      'resize ok',
      'rotate ok',
      'avatar ok',
      'dataUri ok',
      'errors ok',
    ]) {
      expect(tree).toContain(expected);
    }
    expect(tree).not.toContain('BAD');
    expect(tree).not.toContain('FAILED');

    // The JPEG data URI shows the four quadrants of the cropped square.
    await desktopExpect(app.getByTestId('manipulated-avatar')).toBeVisible();
    await colour('manipulated-avatar', 0.25, 0.25, [255, 0, 0]);
    await colour('manipulated-avatar', 0.75, 0.25, [0, 255, 0]);
    await colour('manipulated-avatar', 0.25, 0.75, [0, 0, 255]);
    await colour('manipulated-avatar', 0.75, 0.75, [255, 255, 0]);

    const red = [255, 0, 0];
    const white = [255, 255, 255];
    // A fixed circle with a panned and zoomed image inside: the image does not
    // leak out of the circle, above it or at its corners.
    await colour('clip-pan', 0.5, 0.5, red);
    await colour('clip-pan', 0.5, 0.2, red);
    await colour('clip-pan', 0.5, 0.15, white);
    await colour('clip-pan', 0.18, 0.18, white);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an SVG illustration with rotated cards and drop shadows looks like Chrome', async () => {
  const reference = PNG.sync.read(
    fs.readFileSync(
      path.join(__dirname, 'reference', 'chrome-illustration.png'),
    ),
  );
  await launch('GPUISvgFilterFixture');
  await desktopExpect(app.getByTestId('svg-filter')).toBeVisible();
  const count = (image: PNG, level: number) => {
    expect([image.width, image.height]).toEqual([
      reference.width,
      reference.height,
    ]);
    let different = 0;
    for (let i = 0; i < reference.width * reference.height; i += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        if (
          Math.abs(
            image.data[i * 4 + channel] - reference.data[i * 4 + channel],
          ) > level
        ) {
          different += 1;
          break;
        }
      }
    }
    return different;
  };
  await new Promise(resolve => setTimeout(resolve, 1000));
  const shot = await app.getByTestId('svg-filter').screenshot();
  fs.writeFileSync(
    process.env.SVG_FILTER_OUT ?? os.tmpdir() + '/svg-filter.png',
    shot,
  );
  const image = PNG.sync.read(shot);
  console.log(
    'svg illustration mismatches',
    JSON.stringify({ over2: count(image, 2), over8: count(image, 8) }),
  );
  expect(count(image, 8)).toBeLessThanOrEqual(300);
});

test('an SVG icon has the same antialiased edge and place as Chrome draws', async () => {
  // The references are what Chrome draws at a device scale of 2 on #f7f7f7: the
  // Material "star outline" at 16 CSS pixels, and the arrow-left icon at 15 CSS
  // pixels centred in a 20 pixel button, where Chrome snaps the icon to a whole
  // CSS pixel.
  const read = (name: string) =>
    PNG.sync.read(fs.readFileSync(path.join(__dirname, 'reference', name)));
  const cases: Array<[string, PNG]> = [
    ['svg-edge-fixed', read('chrome-star-16.png')],
    ['svg-edge-stretched', read('chrome-star-16.png')],
    ['svg-edge-centered', read('chrome-arrow-centered.png')],
    ['svg-edge-centered-stretched', read('chrome-arrow-centered.png')],
    ['svg-edge-search', read('chrome-search-15.png')],
    ['svg-edge-search-transform', read('chrome-search-transform.png')],
  ];
  await launch('GPUISvgEdgeFixture');
  const mismatches: Record<string, number> = {};
  for (const [testID, reference] of cases) {
    await desktopExpect(app.getByTestId(testID)).toBeVisible();
    const count = (image: PNG) => {
      expect([image.width, image.height]).toEqual([
        reference.width,
        reference.height,
      ]);
      let different = 0;
      for (let i = 0; i < reference.width * reference.height; i += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          if (
            Math.abs(
              image.data[i * 4 + channel] - reference.data[i * 4 + channel],
            ) > 2
          ) {
            different += 1;
            break;
          }
        }
      }
      return different;
    };
    // The icon paints a moment after its node exists.
    const deadline = Date.now() + 5000;
    let different = count(
      PNG.sync.read(await app.getByTestId(testID).screenshot()),
    );
    while (different > 20 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
      different = count(
        PNG.sync.read(await app.getByTestId(testID).screenshot()),
      );
    }
    mismatches[testID] = different;
  }
  // Pixels more than two levels away from Chrome's.
  console.log('svg edge mismatches', JSON.stringify(mismatches));
  expect(Math.max(...Object.values(mismatches))).toBeLessThanOrEqual(8);
});
