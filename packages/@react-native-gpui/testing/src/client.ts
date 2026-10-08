import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';

const pixelmatch: (
  img1: Uint8Array,
  img2: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
  options?: { threshold?: number },
) => number = require('pixelmatch');

export type Match = {
  tag: number;
  component: string;
  testID: string;
  text: string;
  role: string;
  label: string;
  frame: { x: number; y: number; width: number; height: number };
  visible: boolean;
  enabled: boolean;
  state: { disabled: boolean; selected: boolean; checked?: boolean | string };
};

type DriverResponse = {
  id: number;
  result?: unknown;
  error?: { message?: string };
};

export type LaunchOptions = {
  executable?: string;
  bundle?: string;
  /**
   * Launch with a hidden, unfocused window (faster, and it keeps the
   * developer's focus on the terminal). `RN_GPUI_TEST_HEADED=1` — set by
   * `npm run test:e2e -- --headed` — overrides this so windows are visible.
   */
  offscreen?: boolean;
  idleOptions?: IdleOptions;
  initialProps?: Record<string, unknown>;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  logFile?: string;
  /** Disable GPUI-managed navigation transitions for deterministic, faster tests. */
  disableAnimations?: boolean;
};

export type ScreenshotOptions = {
  threshold?: number;
  maxDiffPixels?: number;
};

export type ClickOptions = {
  button?: 'left' | 'right' | 'middle' | 'back' | 'forward';
  clickCount?: number;
  modifiers?: {
    control?: boolean;
    alt?: boolean;
    shift?: boolean;
    platform?: boolean;
    function?: boolean;
  };
};

export type IdleOptions = {
  timeout?: number;
  /** Ignore HTTP requests whose URL contains any listed substring. */
  ignoreUrls?: string[];
  ignore?: Array<
    | 'frames'
    | 'animations'
    | 'gestures'
    | 'js'
    | 'mount'
    | 'timers'
    | 'network'
    | 'images'
    | 'websockets'
  >;
};

export class DesktopApp {
  readonly logs: string[];
  readonly logFile: string;
  /**
   * Display scale factor reported by the window (`hello` handshake). Screenshot
   * baselines are rasterized at this scale, so they are stored per scale: the
   * same window captures twice as many pixels on a Retina display as it does on
   * a 1x display.
   */
  scale = 1;
  private readonly process: ChildProcess;
  private readonly socket: WebSocket;
  private readonly token: string;
  private idleOptions: IdleOptions = {};
  private readonly allowedErrors: RegExp[] = [];
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private constructor(
    process: ChildProcess,
    socket: WebSocket,
    token: string,
    logs: string[],
    logFile: string,
  ) {
    this.process = process;
    this.socket = socket;
    this.token = token;
    this.logs = logs;
    this.logFile = logFile;
    socket.addEventListener('message', event => {
      const response = JSON.parse(String(event.data)) as DriverResponse;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error) pending.reject(new Error(response.error.message));
      else if (
        response.result &&
        typeof response.result === 'object' &&
        'error' in response.result
      ) {
        pending.reject(new Error(String(response.result.error)));
      } else pending.resolve(response.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('GPUI test-driver connection closed'));
      }
      this.pending.clear();
    });
  }

  get pid(): number | undefined {
    return this.process.pid;
  }

  static async launch(options: LaunchOptions): Promise<DesktopApp> {
    options = {
      ...options,
      bundle: options.bundle ?? process.env.RN_GPUI_TEST_BUNDLE,
    };
    const token = randomBytes(24).toString('hex');
    const logFile =
      options.logFile ??
      path.join(
        os.tmpdir(),
        `rn-gpui-test-${randomBytes(6).toString('hex')}.log`,
      );
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const logDescriptor = fs.openSync(logFile, 'w');
    const executable = options.executable ?? process.env.RN_GPUI_TEST_BINARY;
    if (!executable) {
      fs.closeSync(logDescriptor);
      throw new Error(
        'Provide executable or RN_GPUI_TEST_BINARY; build with run-desktop --features test-driver --no-launch',
      );
    }
    const bundlePath =
      options.bundle ??
      options.env?.RN_GPUI_BUNDLE ??
      process.env.RN_GPUI_BUNDLE;
    const child = spawn(executable, options.args ?? [], {
      env: {
        ...process.env,
        ...(bundlePath
          ? {
              RN_GPUI_BUNDLE: path.resolve(bundlePath),
              RN_GPUI_ASSETS_DIR: path.join(
                path.dirname(path.resolve(bundlePath)),
                'assets/assets',
              ),
            }
          : {}),
        ...options.env,
        ...(options.initialProps
          ? { RN_GPUI_TEST_INITIAL_PROPS: JSON.stringify(options.initialProps) }
          : {}),
        ...(options.offscreen && process.env.RN_GPUI_TEST_HEADED !== '1'
          ? { RN_GPUI_TEST_OFFSCREEN: '1' }
          : {}),
        RN_GPUI_TEST_DRIVER: '1',
        RN_GPUI_TEST_DRIVER_TOKEN: token,
      },
      detached: true,
      stdio: ['ignore', logDescriptor, logDescriptor],
    });
    fs.closeSync(logDescriptor);
    child.unref();
    const logs: string[] = [];
    const timeout = options.timeout ?? 30_000;
    let port: number;
    try {
      port = await waitForPort(
        child,
        () => fs.readFileSync(logFile, 'utf8'),
        logs,
        timeout,
      );
    } catch (error) {
      child.kill('SIGTERM');
      throw error;
    }
    let socket: WebSocket;
    try {
      socket = await connect(port, timeout);
    } catch (error) {
      child.kill('SIGTERM');
      throw error;
    }
    logs.push(fs.readFileSync(logFile, 'utf8'));
    const app = new DesktopApp(child, socket, token, logs, logFile);
    let hello: { protocol?: number; scale?: number };
    try {
      hello = (await app.request('hello')) as {
        protocol?: number;
        scale?: number;
      };
    } catch (error) {
      await app.close();
      throw error;
    }
    if (hello.protocol !== 1) {
      await app.close();
      throw new Error(
        `GPUI test-driver protocol mismatch (received ${hello.protocol ?? 'none'}); rebuild the app with --features test-driver`,
      );
    }
    app.scale =
      typeof hello.scale === 'number' && hello.scale > 0 ? hello.scale : 1;
    if (options.idleOptions) app.setIdleOptions(options.idleOptions);
    if (options.disableAnimations) await app.setAnimationsEnabled(false);
    try {
      await app.waitForIdle({ timeout });
    } catch (error) {
      await app.close();
      throw error;
    }
    (
      globalThis as typeof globalThis & {
        __RN_GPUI_REGISTER_TEST_APP__?: (app: DesktopApp) => void;
      }
    ).__RN_GPUI_REGISTER_TEST_APP__?.(app);
    return app;
  }

  private request<T = unknown>(
    method: string,
    params: object = {},
    timeoutMs = 10_000,
  ): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('GPUI test-driver connection is closed'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer: setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`GPUI test-driver request timed out: ${method}`));
        }, timeoutMs),
      });
      this.socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params: { ...params, token: this.token },
        }),
      );
    });
  }

  getByTestId(testID: string): Locator {
    return new Locator(this, 'testID', testID, true);
  }

  getByText(text: string, options: { exact?: boolean } = {}): Locator {
    return new Locator(this, 'text', text, options.exact ?? true);
  }

  getByRole(role: string, options: { name?: string } = {}): Locator {
    return new Locator(this, 'role', role, true, options.name);
  }

  getByLabel(label: string): Locator {
    return new Locator(this, 'label', label, true);
  }

  async tree(): Promise<unknown> {
    return this.request('tree');
  }

  async screenshot(tag?: number): Promise<Buffer> {
    const result = await this.request<{ png: string; error?: string }>(
      'screenshot',
      tag === undefined ? {} : { tag },
    );
    if (result.error) throw new Error(result.error);
    return Buffer.from(result.png, 'base64');
  }

  setIdleOptions(options: IdleOptions): void {
    this.idleOptions = options;
  }

  async idleStatus(
    options: Pick<IdleOptions, 'ignore' | 'ignoreUrls'> = {},
  ): Promise<{
    idle: boolean;
    stableFrames: number;
    busySources: Array<{ source: string; detail: string }>;
    trackedSources: string[];
    untrackedSources: string[];
  }> {
    return this.request('idleStatus', {
      ignore: options.ignore ?? this.idleOptions.ignore ?? [],
      ignoreUrls: options.ignoreUrls ?? this.idleOptions.ignoreUrls ?? [],
    });
  }

  async waitForIdle(options: IdleOptions = {}): Promise<void> {
    const timeout = options.timeout ?? this.idleOptions.timeout ?? 5_000;
    const ignore = options.ignore ?? this.idleOptions.ignore ?? [];
    const result = await this.request<{
      idle: boolean;
      stableFrames: number;
      busySources: Array<{ source: string; detail: string }>;
      untrackedSources: string[];
    }>(
      'waitForIdle',
      {
        timeout,
        ignore,
        ignoreUrls: options.ignoreUrls ?? this.idleOptions.ignoreUrls ?? [],
      },
      Math.min(35_000, timeout + 1_000),
    );
    if (!result.idle)
      throw new Error(
        `GPUI did not become idle after ${timeout} ms; busy: ${
          (result.busySources ?? [])
            .map(source => `${source.source}: ${source.detail}`)
            .join(', ') || `${result.stableFrames ?? 0}/2 stable frames`
        }; untracked: ${(result.untrackedSources ?? []).join(', ')}`,
      );
  }

  async setAnimationsEnabled(enabled: boolean): Promise<void> {
    await this.request('setAnimationsEnabled', { enabled });
  }

  async setWindowSize(width: number, height: number): Promise<void> {
    await this.request('setWindowSize', { width, height });
  }

  async getWindowBounds(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
    hidden: boolean;
  }> {
    return this.request('getWindowBounds');
  }

  async getWindowSize(): Promise<{ width: number; height: number }> {
    return this.request('getWindowSize');
  }

  async reload(): Promise<void> {
    await this.request('reload');
    await this.waitForIdle({ timeout: 30000 });
  }

  async focusWindow(): Promise<void> {
    await this.request('focusWindow');
  }

  async a11yTree(): Promise<unknown> {
    return this.request('a11yTree');
  }

  async a11yNode(identifier: string): Promise<{
    name: string;
    role: string;
    hint: string;
    enabled: boolean;
  } | null> {
    await this.a11yTree();
    return this.request('a11yNode', { identifier });
  }

  async getProps(tag: number): Promise<unknown> {
    return this.request('getProps', { tag });
  }

  allowErrors(pattern: RegExp): void {
    this.allowedErrors.push(pattern);
  }

  readLogs(): string {
    return fs.readFileSync(this.logFile, 'utf8');
  }

  assertNoErrors(): void {
    const errors = this.readLogs()
      .split('\n')
      .filter(
        line =>
          /\bERROR\b|console\.error|\[error\]/u.test(line) &&
          !this.allowedErrors.some(pattern => {
            pattern.lastIndex = 0;
            return pattern.test(line);
          }),
      );
    if (errors.length)
      throw new Error(`App logged unexpected errors:\n${errors.join('\n')}`);
  }

  async saveArtifacts(directory: string): Promise<void> {
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(this.logFile, path.join(directory, 'app.log'));
    for (const [name, capture] of [
      [
        'tree.json',
        async () => Buffer.from(JSON.stringify(await this.tree(), null, 2)),
      ],
      [
        'a11y.json',
        async () => Buffer.from(JSON.stringify(await this.a11yTree(), null, 2)),
      ],
      ['screenshot.png', () => this.screenshot()],
    ] as const) {
      try {
        fs.writeFileSync(path.join(directory, name), await capture());
      } catch (error) {
        fs.writeFileSync(
          path.join(directory, name + '.error.txt'),
          String(error),
        );
      }
    }
  }

  async close(): Promise<void> {
    this.socket.close();
    if (this.process.exitCode !== null || this.process.signalCode !== null)
      return;
    this.process.kill('SIGTERM');
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        this.process.kill('SIGKILL');
        resolve();
      }, 3000);
      this.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  disconnect(): void {
    this.socket.close();
    this.process.unref();
  }

  async query(
    by: string,
    value: string,
    exact = false,
    name?: string,
    within?: number,
  ): Promise<Match[]> {
    return this.request<Match[]>('query', { by, value, exact, name, within });
  }

  async click(tag: number, options: ClickOptions = {}): Promise<void> {
    await this.request('click', { tag, ...options });
  }

  async hover(tag: number): Promise<void> {
    await this.request('hover', { tag });
  }

  async scroll(tag: number, dx = 0, dy = 0): Promise<void> {
    await this.request('scroll', { tag, dx, dy });
  }

  async mouseDown(
    position: { x: number; y: number },
    options: ClickOptions = {},
  ): Promise<void> {
    await this.request('mouseDown', { ...position, ...options });
  }
  async mouseUp(
    position: { x: number; y: number },
    options: ClickOptions = {},
  ): Promise<void> {
    await this.request('mouseUp', { ...position, ...options });
  }
  async mouseMove(
    position: { x: number; y: number },
    options: ClickOptions = {},
  ): Promise<void> {
    await this.request('mouseMove', { ...position, ...options });
  }
  async focus(tag: number): Promise<void> {
    await this.request('focus', { tag });
  }

  async press(key: string): Promise<void> {
    await this.request('press', { key });
  }

  async typeText(tag: number, text: string): Promise<void> {
    const result = await this.request<{ typed: boolean }>('type', {
      tag,
      text,
    });
    if (!result.typed) throw new Error('GPUI test driver did not type text');
  }

  async drag(
    fromTag: number,
    toTag: number,
    options: { steps?: number; duration?: number } = {},
  ): Promise<void> {
    const result = await this.request<{ dragged: boolean; steps: number }>(
      'drag',
      { fromTag, toTag, ...options },
    );
    if (!result.dragged)
      throw new Error('GPUI test driver did not complete drag');
  }
}

export class Locator {
  private readonly index?: number;

  constructor(
    readonly app: DesktopApp,
    private readonly by: string,
    private readonly value: string,
    private readonly exact = false,
    private readonly name?: string,
    index?: number,
    private readonly scope?: Locator,
  ) {
    this.index = index;
  }

  first(): Locator {
    return this.nth(0);
  }

  nth(index: number): Locator {
    if (!Number.isInteger(index) || index < 0)
      throw new Error('Locator index must be a non-negative integer');
    return new Locator(
      this.app,
      this.by,
      this.value,
      this.exact,
      this.name,
      index,
      this.scope,
    );
  }

  async all(): Promise<Match[]> {
    const root = this.scope ? await this.scope.firstMatch() : undefined;
    return this.app.query(
      this.by,
      this.value,
      this.exact,
      this.name,
      root?.tag,
    );
  }

  within(scope: Locator): Locator {
    if (scope.app !== this.app)
      throw new Error('within requires locators in the same app');
    return new Locator(
      this.app,
      this.by,
      this.value,
      this.exact,
      this.name,
      this.index,
      scope,
    );
  }

  async count(): Promise<number> {
    return (await this.all()).length;
  }

  async click(options: ClickOptions = {}): Promise<void> {
    const match = await this.actionableMatch();
    await this.app.click(match.tag, options);
    await this.app.waitForIdle();
  }

  async doubleClick(): Promise<void> {
    return this.click({ clickCount: 2 });
  }

  async rightClick(): Promise<void> {
    return this.click({ button: 'right' });
  }

  async clear(): Promise<void> {
    await this.click();
    await this.app.press('mod-a');
    await this.app.press('backspace');
    await this.app.waitForIdle();
  }

  async hover(): Promise<void> {
    const match = await this.actionableMatch();
    await this.app.hover(match.tag);
    await this.app.waitForIdle();
  }

  async scroll(dx = 0, dy = 0): Promise<void> {
    const match = await this.actionableMatch();
    await this.app.scroll(match.tag, dx, dy);
    await this.app.waitForIdle();
  }

  async press(key: string): Promise<void> {
    const match = await this.firstMatch();
    if (!match.visible) throw new Error(`${this} is not visible`);
    if (!match.enabled) throw new Error(`${this} is disabled`);
    await this.app.focus(match.tag);
    await this.app.press(key);
    await this.app.waitForIdle();
  }

  async type(text: string): Promise<void> {
    const match = await this.actionableMatch();
    // Use click's native covering-node preflight before injecting text.
    await this.app.click(match.tag);
    await this.app.waitForIdle();
    await this.app.typeText(match.tag, text);
    await this.app.waitForIdle();
  }

  async dragTo(
    target: Locator,
    options: { steps?: number; duration?: number } = {},
  ): Promise<void> {
    if (this.app !== target.app)
      throw new Error(
        'dragTo requires both locators to belong to the same app',
      );
    const sourceMatch = await this.actionableMatch();
    const targetMatch = await target.actionableMatch();
    await this.app.drag(sourceMatch.tag, targetMatch.tag, options);
    await this.app.waitForIdle();
  }

  async isVisible(): Promise<boolean> {
    const matches = await this.all();
    const match = this.index === undefined ? matches[0] : matches[this.index];
    return Boolean(match?.visible);
  }

  async textContent(): Promise<string> {
    return (await this.firstMatch()).text;
  }

  async screenshot(): Promise<Buffer> {
    const match = await this.firstMatch();
    if (!match.visible) throw new Error(`${this} is not visible`);
    return this.app.screenshot(match.tag);
  }

  async toBeVisible(timeout = 5000): Promise<void> {
    await retry(async () => {
      const matches = await this.all();
      const match = this.index === undefined ? matches[0] : matches[this.index];
      if (!match?.visible) throw new Error(`${this} is not visible`);
    }, timeout);
  }

  async toHaveText(expected: string, timeout = 5000): Promise<void> {
    await retry(async () => {
      const matches = await this.all();
      const match = this.index === undefined ? matches[0] : matches[this.index];
      if (!match || match.text !== expected)
        throw new Error(`${this} text was ${JSON.stringify(match?.text)}`);
    }, timeout);
  }

  async assertAccessibility(
    property: 'name' | 'role',
    expected: string,
    timeout = 5000,
  ): Promise<void> {
    await retry(async () => {
      const match = await this.firstMatch();
      if (!match.testID)
        throw new Error(
          'Native accessibility assertions require a testID locator',
        );
      const node = await this.app.a11yNode(match.testID);
      const value =
        property === 'role'
          ? normalizeAccessibleRole(node?.role ?? '')
          : node?.name;
      if (property === 'role') expected = normalizeAccessibleRole(expected);
      if (value !== expected)
        throw new Error(
          `${this} native accessible ${property} was ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`,
        );
    }, timeout);
  }

  async assertMatch(
    predicate: (match: Match | undefined, count: number) => boolean,
    description: string,
    timeout = 5000,
  ): Promise<void> {
    await retry(async () => {
      const matches = await this.all();
      const match = this.index === undefined ? matches[0] : matches[this.index];
      if (!predicate(match, matches.length))
        throw new Error(
          `${this} ${description}; received ${JSON.stringify(match)}`,
        );
    }, timeout);
  }

  private async firstMatch(): Promise<Match> {
    let matches = await this.all();
    if (this.index === undefined) {
      const visible = matches.filter(match => match.visible);
      // Navigation retains inactive screens. Actions resolve the exposed
      // screen; explicit nth()/all() still address the complete store query.
      if (visible.length) matches = visible;
    }
    if (matches.length === 0) throw new Error(`${this} matched no nodes`);
    if (this.index !== undefined) {
      if (!matches[this.index]) throw new Error(`${this} matched no nodes`);
      return matches[this.index];
    }
    if (matches.length > 1)
      throw new Error(
        `${this} matched ${matches.length} nodes; narrow the locator`,
      );
    return matches[0];
  }

  private async actionableMatch(): Promise<Match> {
    await this.app.waitForIdle();
    const first = await this.firstMatch();
    if (!first.visible) throw new Error(`${this} is not visible`);
    if (!first.enabled) throw new Error(`${this} is disabled`);
    await this.app.waitForIdle();
    const second = await this.firstMatch();
    if (!second.visible) throw new Error(`${this} became hidden`);
    if (!second.enabled) throw new Error(`${this} became disabled`);
    const frameStable = (key: keyof Match['frame']) =>
      Math.abs(first.frame[key] - second.frame[key]) <= 0.5;
    if (
      first.tag !== second.tag ||
      !Object.keys(first.frame).every(key =>
        frameStable(key as keyof Match['frame']),
      )
    ) {
      throw new Error(`${this} is moving; retry the action after it settles`);
    }
    return second;
  }

  toString(): string {
    return `getBy${this.by}(${JSON.stringify(this.value)})`;
  }
}

export async function launchApp(options: LaunchOptions): Promise<DesktopApp> {
  return DesktopApp.launch(options);
}

export function expect(target: Locator | DesktopApp) {
  const check = (
    predicate: (match: Match | undefined, count: number) => boolean,
    description: string,
    timeout?: number,
  ) => {
    if (!(target instanceof Locator))
      throw new Error(`${description} expects a locator`);
    return target.assertMatch(predicate, description, timeout);
  };
  return {
    toHaveAccessibleName: (name: string, timeout?: number) => {
      if (!(target instanceof Locator)) throw new Error('Expected locator');
      return target.assertAccessibility('name', name, timeout);
    },
    toHaveAccessibleRole: (role: string, timeout?: number) => {
      if (!(target instanceof Locator)) throw new Error('Expected locator');
      return target.assertAccessibility('role', role.toLowerCase(), timeout);
    },
    toBeHidden: (timeout?: number) =>
      check(m => !m?.visible, 'must be hidden', timeout),
    toBeEnabled: (timeout?: number) =>
      check(m => !!m?.enabled, 'must be enabled', timeout),
    toBeDisabled: (timeout?: number) =>
      check(m => !!m && !m.enabled, 'must be disabled', timeout),
    toBeSelected: (timeout?: number) =>
      check(m => !!m?.state.selected, 'must be selected', timeout),
    toBeChecked: (timeout?: number) =>
      check(m => m?.state.checked === true, 'must be checked', timeout),
    toContainText: (text: string, timeout?: number) =>
      check(
        m => !!m?.text.includes(text),
        `must contain ${JSON.stringify(text)}`,
        timeout,
      ),
    toHaveCount: (count: number, timeout?: number) =>
      check((_, n) => n === count, `must match ${count} nodes`, timeout),
    toBeVisible: (timeout?: number) => {
      if (!(target instanceof Locator))
        throw new Error('toBeVisible expects a locator');
      return target.toBeVisible(timeout);
    },
    toHaveText: (text: string, timeout?: number) => {
      if (!(target instanceof Locator))
        throw new Error('toHaveText expects a locator');
      return target.toHaveText(text, timeout);
    },
    toHaveValue: (value: string, timeout?: number) => {
      if (!(target instanceof Locator))
        throw new Error('toHaveValue expects a locator');
      return target.toHaveText(value, timeout);
    },
    toMatchScreenshot: (name: string, options?: ScreenshotOptions) => {
      const scale = target instanceof Locator ? target.app.scale : target.scale;
      return target
        .screenshot()
        .then(buffer => matchScreenshot(buffer, name, options, scale));
    },
  };
}

function normalizeAccessibleRole(role: string): string {
  const value = role.replace(/^AX/u, '').toLowerCase();
  return (
    (
      {
        textfield: 'textbox',
        textinput: 'textbox',
        statictext: 'text',
        checkbox: 'checkbox',
        radiobutton: 'radio',
        popupbutton: 'combobox',
      } as Record<string, string>
    )[value] ?? value
  );
}

/** Small semantic checks, based on the rendered AccessKit tree. */
export async function expectNoA11yViolations(app: DesktopApp): Promise<void> {
  const tree = (await app.a11yTree()) as {
    nodes?: Record<
      string,
      { children?: string[]; aria?: { role?: string; label?: string } }
    >;
  };
  if (!tree?.nodes)
    throw new Error('The native accessibility tree is unavailable');
  const nodes = tree.nodes;
  const name = (key: string, visited = new Set<string>()): string => {
    if (visited.has(key)) return '';
    visited.add(key);
    const node = nodes[key];
    return (
      node?.aria?.label ??
      node?.children?.map(child => name(child, visited)).join(' ') ??
      ''
    );
  };
  const violations: string[] = [];
  const interactive = new Set([
    'Button',
    'DefaultButton',
    'Link',
    'TextInput',
    'CheckBox',
    'RadioButton',
    'Switch',
    'ComboBox',
    'MenuItem',
    'Tab',
  ]);
  for (const [key, node] of Object.entries(nodes)) {
    if (
      (interactive.has(node.aria?.role ?? '') || node.aria?.role === 'Image') &&
      !name(key).trim()
    )
      violations.push(
        `Native ${node.aria?.role} accesskit_id=${key} has no accessible name`,
      );
  }
  const ids = new Set<string>();
  const walk = (node: { testID?: string; children?: unknown[] }) => {
    if (node.testID) ids.add(node.testID);
    for (const child of node.children ?? []) walk(child as typeof node);
  };
  walk((await app.tree()) as Parameters<typeof walk>[0]);
  for (const id of ids) {
    const visible = (await app.query('testID', id, true)).filter(
      node => node.visible,
    );
    for (let index = 0; index < Math.min(visible.length, 1); index++) {
      // Resolve author IDs through the native provider, so diagnostics identify
      // the React Native testID rather than only an ephemeral AccessKit ID.
      const native = await app.a11yNode(id);
      if (
        native &&
        !native.name.trim() &&
        /^(button|link|textbox|checkbox|radio|switch|combobox|menuitem|tab|image)$/u.test(
          normalizeAccessibleRole(native.role),
        )
      ) {
        violations.push(
          `Native ${native.role} testID=${JSON.stringify(id)} has no accessible name`,
        );
      }
    }
    if (visible.length > 1)
      violations.push(
        `Duplicate visible testID ${JSON.stringify(id)} (${visible.length} nodes)`,
      );
  }
  if (violations.length)
    throw new Error(`Accessibility violations:\n${violations.join('\n')}`);
}

export async function matchScreenshot(
  actualBuffer: Buffer,
  name: string,
  options: ScreenshotOptions = {},
  scale = 1,
): Promise<void> {
  const testPath = getCurrentTestPath();
  // Baselines are rasterized at the window's display scale, so a machine whose
  // main display is 1x captures different pixels (and dimensions) than a Retina
  // one. Keying the directory by scale keeps both exact instead of loosening
  // the comparison.
  const scaleSuffix = `@${scale}x`;
  const baselineRoot = path.join(
    path.dirname(testPath),
    '__screenshots__',
    'gpui',
    `${process.platform}-${process.arch}${scaleSuffix}`,
  );
  const snapshotName = name.endsWith('.png') ? name : `${name}.png`;
  const baselinePath = path.resolve(baselineRoot, snapshotName);
  if (!baselinePath.startsWith(`${baselineRoot}${path.sep}`))
    throw new Error(
      'Screenshot snapshot name must stay inside __screenshots__/gpui',
    );
  const update =
    process.argv.includes('-u') ||
    process.argv.includes('--update') ||
    process.env.RN_GPUI_UPDATE_SNAPSHOTS === '1';

  if (update || !fs.existsSync(baselinePath)) {
    if (!update)
      throw new Error(
        `Screenshot baseline is missing: ${baselinePath}. Run Vitest with --update to create it.`,
      );
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, actualBuffer);
    return;
  }

  const expectedBuffer = fs.readFileSync(baselinePath);
  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(expectedBuffer);
  const artifactDir = path.resolve(
    '.local/test-artifacts',
    path.basename(testPath),
  );
  fs.mkdirSync(artifactDir, { recursive: true });
  const actualPath = path.join(artifactDir, `${name}.actual.png`);
  fs.writeFileSync(actualPath, actualBuffer);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Screenshot size differs for ${name}: expected ${expected.width}x${expected.height}, received ${actual.width}x${actual.height}. Actual: ${actualPath}`,
    );
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  const diffPixels = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: options.threshold ?? 0.1 },
  );
  const maxDiffPixels = options.maxDiffPixels ?? 0;
  if (diffPixels > maxDiffPixels) {
    const diffPath = path.join(artifactDir, `${name}.diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    throw new Error(
      `Screenshot ${name} differs by ${diffPixels} pixels (maximum ${maxDiffPixels}). Actual: ${actualPath}; diff: ${diffPath}`,
    );
  }
}

function getCurrentTestPath(): string {
  const runtimeExpect = (
    globalThis as typeof globalThis & {
      expect?: { getState?: () => { testPath?: string } };
    }
  ).expect;
  const testPath = runtimeExpect?.getState?.().testPath;
  return testPath
    ? path.resolve(testPath)
    : path.join(process.cwd(), 'screenshot.test.ts');
}

async function retry(
  action: () => Promise<void>,
  timeout: number,
): Promise<void> {
  const end = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < end) {
    try {
      await action();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw lastError;
}

async function waitForPort(
  child: ChildProcess,
  getOutput: () => string,
  logs: string[],
  timeout: number,
): Promise<number> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const match = getOutput().match(/RN_GPUI_TEST_DRIVER_PORT=(\d+)/u);
    if (match) return Number(match[1]);
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `GPUI test app exited before starting the driver:\n${logs.join('')}`,
      );
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  child.kill('SIGTERM');
  throw new Error(
    `Timed out waiting for the GPUI test-driver port:\n${logs.join('')}`,
  );
}

async function connect(port: number, timeout: number): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}`,
  ) as unknown as WebSocket;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('WebSocket connect timed out')),
      timeout,
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(
          new Error('Could not connect to the GPUI test-driver WebSocket'),
        );
      },
      { once: true },
    );
  });
  return socket;
}
