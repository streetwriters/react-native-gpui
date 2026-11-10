import path from 'node:path';
import fs from 'node:fs';
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
    logFile: process.env.RN_GPUI_E2E_LOG,
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

test('pointer buttons, click count and modifier keys use the focused input', async () => {
  await launch('E2EProbesFixture');
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
  await launch('E2EProbesFixture');
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
