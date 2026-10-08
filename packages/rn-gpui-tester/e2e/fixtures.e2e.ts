import path from 'node:path';
import fs from 'node:fs';
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
    offscreen: true,
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

test('single-line input stays fixed, clips selection, and scrolls with its caret', async () => {
  await launch('SingleLineTextInputFixture');
  const input = app.getByTestId('single-line-input');
  const empty = (await app.query('testID', 'single-line-input', true))[0];
  await input.type('a');
  const firstCharacter = (
    await app.query('testID', 'single-line-input', true)
  )[0];
  expect(firstCharacter.frame).toEqual(empty.frame);
  fs.writeFileSync(
    path.resolve('.local/single-line-first-character.png'),
    await app.screenshot(),
  );

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
  fs.writeFileSync(
    path.resolve('.local/single-line-select-all.png'),
    await app.screenshot(),
  );
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

test('native accessibility exposes labels, roles, state, values and hidden subtrees', async () => {
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
});

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
  await expect(expectNoA11yViolations(app)).rejects.toThrow(
    'Duplicate visible testID "duplicate"',
  );
  await expect(app.getByTestId('duplicate').click()).rejects.toThrow(
    'matched 2 nodes',
  );
});

test('hidden windows resize, capture and receive keyboard input', async () => {
  await launch('NavigationFixture', 'stack');
  await app.setWindowSize(640, 480);
  await app.focusWindow();
  expect(await app.getWindowSize()).toEqual({ width: 640, height: 480 });
  // A headed run deliberately shows the window instead of hiding it.
  expect((await app.getWindowBounds()).hidden).toBe(
    process.env.RN_GPUI_TEST_HEADED !== '1',
  );
  await app.getByTestId('e2e-text-input').type('Hidden window input');
  await desktopExpect(app.getByTestId('e2e-text-input')).toHaveValue(
    'Hidden window input',
  );
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
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
      imageResizeMode: number;
    };
    expect(props.imageUri.length).toBeGreaterThan(0);
    if (mode !== 'data-uri') {
      expect(props.imageResizeMode).toBe(
        { stretch: 0, contain: 1, cover: 2, center: 3 }[mode],
      );
    }
  }
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
});

test('Text layout preserves explicit line breaks and accented content', async () => {
  await launch('TextFixture');
  const paragraph = app.getByTestId('text-hard-break');
  await desktopExpect(paragraph).toContainText('First line: gjpqy ÁÉÅ');
  await desktopExpect(paragraph).toContainText('Second line: café naïve');
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
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
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
});

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
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
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
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
});

test('SVG primitives, SvgXml and remote SvgUri render from an SVG response', async () => {
  await launch('GPUISvgFixture');
  await desktopExpect(app.getByTestId('svg-title')).toBeVisible();
  await desktopExpect(app.getByTestId('svg-uri-status')).toContainText(
    'Remote SvgUri loaded',
  );
  const tree = JSON.stringify(await app.tree());
  expect(tree).toContain('React Native SVG');
  expect((await app.screenshot()).length).toBeGreaterThan(1000);
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
