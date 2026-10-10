import fs from 'node:fs';
import path from 'node:path';
import {
  expect,
  expectNoA11yViolations,
  launchApp,
  type DesktopApp,
} from '@react-native-gpui/testing';

let app: DesktopApp;

beforeAll(async () => {
  const executable = process.env.RN_GPUI_TEST_BINARY;
  if (!executable)
    throw new Error('RN_GPUI_TEST_BINARY must point to the built test app');
  app = await launchApp({
    executable,
    env: {
      RN_GPUI_MODULE: 'NavigationFixture',
      RN_GPUI_BUNDLE: path.resolve(
        'packages/rn-gpui-tester/desktop/build/test-e2e.bundle',
      ),
      RN_GPUI_DEV_HOST: '127.0.0.1',
      RN_GPUI_DEV_PORT: '1',
      RN_GPUI_WINDOW_STATE: path.resolve('.local/7.16-e2e-window.json'),
    },
    disableAnimations: true,
    // Every other suite launches offscreen; this one predates that and used
    // to flash a real window (and sit at the centre of the display) on Linux.
    offscreen: true,
    logFile: path.resolve('.local/7.16-e2e-app.log'),
  });
  if (app.pid) fs.writeFileSync('.local/7.16-e2e.pid', `${app.pid}\n`);
}, 45_000);

afterAll(() => {
  // Keep the app open between test runs; the build script terminates it before
  // the next rebuild, following the desktop-probe workflow.
  app?.disconnect();
});

test('starts the real RN app and navigates through Fabric input', async () => {
  try {
    await app.setAnimationsEnabled(false);
    await app.setWindowSize(1024, 768);
    await app.focusWindow();
    const size = await app.getWindowSize();
    if (size.width !== 1024 || size.height !== 768)
      throw new Error(`Incorrect viewport: ${JSON.stringify(size)}`);
    await app.waitForIdle();
    const idle = await app.idleStatus();
    if (
      !idle.idle ||
      !idle.trackedSources.includes('frames') ||
      !idle.trackedSources.includes('mount') ||
      !idle.trackedSources.includes('timers') ||
      !idle.trackedSources.includes('network') ||
      !idle.trackedSources.includes('images') ||
      idle.untrackedSources.includes('websockets')
    ) {
      throw new Error(`Unexpected idle status: ${JSON.stringify(idle)}`);
    }
    await expect(app.getByText('Home')).toBeVisible(15_000);
    // AccessKit only builds a tree while the platform reports it as active:
    // macOS forces the probe, Linux needs the AT-SPI bus (enabled by the e2e
    // runner).
    if (app.nativeA11ySupported) {
      const a11y = (await app.a11yTree()) as {
        nodes?: Record<string, { aria?: { role?: string } }>;
      };
      if (
        !a11y?.nodes ||
        !Object.values(a11y.nodes).some(node => node.aria?.role === 'Button')
      )
        throw new Error('Real AccessKit tree has no button nodes');
    }
    const fetchControl = await app.query('testID', 'e2e-network-request', true);
    if (!fetchControl[0]) throw new Error('Fetch control is not mounted');
    await app.click(fetchControl[0].tag);
    const networkBusyDeadline = Date.now() + 2_000;
    let networkBusy = false;
    while (Date.now() < networkBusyDeadline) {
      const current = await app.idleStatus();
      if (current.busySources.some(source => source.source === 'network')) {
        networkBusy = true;
        break;
      }
    }
    if (!networkBusy) throw new Error('Fetch did not register as network-busy');
    await app.waitForIdle({ timeout: 1_000, ignoreUrls: ['/idle'] });
    const excluded = await app.idleStatus();
    if (!excluded.busySources.some(source => source.source === 'network'))
      throw new Error('Expected the delayed HTTP request to remain active');
    await app.waitForIdle({ timeout: 5_000 });
    const networkIdle = await app.idleStatus();
    if (!networkIdle.idle)
      throw new Error(
        `HTTP request stayed busy after completion: ${JSON.stringify(networkIdle)}`,
      );
    await expect(app.getByTestId('e2e-network-result')).toHaveText(
      'network-idle-ok',
    );
    // Visual baselines run where the backend can capture (Apple backends today).
    if (app.captureSupported) {
      await expect(app).toMatchScreenshot('navigation-home');
      await expect(app.getByTestId('Home-title')).toMatchScreenshot(
        'navigation-home-heading',
      );
    }
    const input = app.getByTestId('e2e-text-input');
    await input.type('desktop test input');
    await expect(input).toHaveValue('desktop test input');
    await expect(input).toBeEnabled();
    // Native accessibility name/role lookups (and the tree audit) need the
    // AccessKit tree (see the check above).
    if (app.nativeA11ySupported) {
      await expect(input).toHaveAccessibleName('Desktop test input');
      await expect(input).toHaveAccessibleRole('textbox');
      await expectNoA11yViolations(app);
    }
    await expect(input).toHaveCount(1);
    await expect(app.getByTestId('missing-node')).toBeHidden();
    await input.clear();
    await expect(input).toHaveValue('');
    await input.type('desktop test input');
    await app
      .getByTestId('e2e-drag-source')
      .dragTo(app.getByTestId('e2e-drag-target'));
    const dragText = await app.getByTestId('e2e-drag-result').textContent();
    if (!/^dx:[1-9]\d*/u.test(dragText))
      throw new Error(`PanResponder did not receive drag updates: ${dragText}`);
    await app.getByText('Open details').hover();
    await app.getByTestId('Home-title').scroll(0, 12);
    await app.getByText('Open details').press('escape');
    await app.getByText('Open details').click();
    await expect(app.getByText('Details 1')).toBeVisible(10_000);
    await app.waitForIdle({ timeout: 3_000, ignore: ['animations'] });
    await expect(app.getByTestId('e2e-disabled')).toBeDisabled();
    for (const [id, message] of [
      ['e2e-disabled', 'disabled'],
      ['e2e-hidden', 'not visible|matched no nodes'],
      ['e2e-covered', 'covered by'],
    ]) {
      let failure = '';
      try {
        await app.getByTestId(id).click();
      } catch (error) {
        failure = String(error);
      }
      if (!new RegExp(message).test(failure))
        throw new Error(
          `Expected ${id} to fail ${message}, received ${failure}`,
        );
    }

    const start = await app.query('testID', 'e2e-animation-start', true);
    if (!start[0]) throw new Error('Animation start control is not mounted');
    const beforeLoop = await app.idleStatus();
    if (beforeLoop.busySources.some(source => source.source === 'animations'))
      throw new Error(
        `Animation source was already busy before the loop: ${JSON.stringify(beforeLoop)}`,
      );
    await app.click(start[0].tag);
    const animationDeadline = Date.now() + 2_000;
    let animationBusy = false;
    while (Date.now() < animationDeadline) {
      const status = await app.idleStatus();
      if (status.busySources.some(source => source.source === 'animations')) {
        animationBusy = true;
        break;
      }
    }
    if (!animationBusy)
      throw new Error('Animated.loop did not register as animation-busy');
    let timeoutMessage = '';
    try {
      await app.waitForIdle({ timeout: 350 });
    } catch (error) {
      timeoutMessage = String(error);
    }
    if (!timeoutMessage.includes('animations:'))
      throw new Error(
        `Expected an animation timeout detail, got: ${timeoutMessage}`,
      );
    await app.waitForIdle({ timeout: 2_000, ignore: ['animations'] });
    const stop = await app.query('testID', 'e2e-animation-stop', true);
    if (!stop[0]) throw new Error('Animation stop control is not mounted');
    await app.click(stop[0].tag);
    await app.waitForIdle({ timeout: 2_000 });
    const timerStart = await app.query('testID', 'e2e-timer-start', true);
    if (!timerStart[0]) throw new Error('Timer probe control is not mounted');
    await app.click(timerStart[0].tag);
    const timerDeadline = Date.now() + 2_000;
    let timerBusy = false;
    while (Date.now() < timerDeadline) {
      const status = await app.idleStatus();
      if (status.busySources.some(source => source.source === 'timers')) {
        timerBusy = true;
        break;
      }
    }
    if (!timerBusy) throw new Error('setTimeout was not tracked as busy');
    await app.waitForIdle({ timeout: 3_000 });
    await expect(app.getByTestId('e2e-timer-result')).toHaveText('timer-fired');
    const uiStart = await app.query('testID', 'e2e-worklet-start', true);
    await app.click(uiStart[0].tag);
    let workletTimeout = '';
    try {
      await app.waitForIdle({ timeout: 500 });
    } catch (error) {
      workletTimeout = String(error);
    }
    if (!workletTimeout.includes('UI Worklets frame callback'))
      throw new Error(`UI loop was not tracked: ${workletTimeout}`);
    await app.waitForIdle({ ignore: ['animations'] });
    const uiStop = await app.query('testID', 'e2e-worklet-stop', true);
    await app.click(uiStop[0].tag);
    await app.waitForIdle();
    await app.reload();
    await expect(app.getByText('Home')).toBeVisible();
    await expect(app.getByTestId('e2e-text-input')).toHaveValue('');
    // Reload resets JS animation tags; the old native graph must not be reused.
    for (let cycle = 0; cycle < 3; cycle++) {
      await app.getByText('Open details').click();
      await expect(app.getByTestId('Details 1-title')).toBeVisible();
      await app.press('escape');
      await app.waitForIdle();
      await expect(app.getByTestId('Home-title')).toBeVisible();
      await app.reload();
    }
  } catch (error) {
    await app.saveArtifacts('.local/7.16-e2e-failure');
    fs.mkdirSync('.local/7.16-e2e-failure', { recursive: true });
    try {
      fs.writeFileSync(
        '.local/7.16-e2e-failure/tree.json',
        JSON.stringify(await app.tree(), null, 2),
      );
    } catch {}
    fs.writeFileSync(
      '.local/7.16-e2e-failure/app.log',
      fs.readFileSync(app.logFile, 'utf8'),
    );
    try {
      fs.writeFileSync(
        '.local/7.16-e2e-failure/screenshot.png',
        await app.screenshot(),
      );
    } catch {}
    throw error;
  }
});
