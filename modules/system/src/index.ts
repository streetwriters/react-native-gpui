import NativeSystem from './NativeSystem';

export interface LaunchAtLoginOptions {
  /**
   * Starts the app with `--hidden`, which opens it without showing its window.
   * Pair it with a tray icon so the app can be brought back.
   */
  hidden?: boolean;
  /** Extra arguments to start the app with. */
  args?: string[];
}

export interface RestartOptions {
  /** The arguments of the new copy. The current arguments are kept by default. */
  args?: string[];
}

/** Whether the app is set to start when the user logs in. */
export function getLaunchAtLogin(): Promise<boolean> {
  return NativeSystem.getLaunchAtLogin();
}

/**
 * Turns starting at login on or off. Turning it on again replaces the options
 * of an earlier call.
 */
export function setLaunchAtLogin(
  enabled: boolean,
  options: LaunchAtLoginOptions = {},
): Promise<void> {
  const args = [
    ...(options.hidden ? ['--hidden'] : []),
    ...(options.args ?? []),
  ];
  return NativeSystem.setLaunchAtLogin(enabled, args);
}

/**
 * Quits the app and starts it again once it has exited. The promise normally
 * never settles, because the app is gone; it rejects if the new copy could not
 * be prepared.
 */
export function restart(options: RestartOptions = {}): Promise<void> {
  return NativeSystem.restart(options.args ?? null);
}

/**
 * Hides the app's windows from screenshots, screen recordings and screen sharing
 * (privacy mode). It covers every window of the app, including ones opened later.
 */
export function setContentProtected(enabled: boolean): Promise<void> {
  return NativeSystem.setContentProtected(enabled);
}

/** Whether content protection is on and every open window carries it. */
export function isContentProtected(): Promise<boolean> {
  return NativeSystem.isContentProtected();
}

/**
 * Seconds since the user last used the keyboard, mouse or trackpad anywhere in
 * the session, not only in this app. Poll it to tell when the user went away:
 * macOS and Windows report it, and Linux rejects with `ERR_UNSUPPORTED`.
 */
export function getIdleTime(): Promise<number> {
  return NativeSystem.getIdleTime();
}

/**
 * Sets the number or text shown on the app's Dock icon, or removes it with
 * `null`, `0` or an empty string. macOS only; other platforms reject with
 * `ERR_UNSUPPORTED`.
 */
export function setBadge(value: number | string | null): Promise<void> {
  const label =
    value === null || value === 0 || value === '' ? null : String(value);
  return NativeSystem.setBadge(label);
}

/** The text on the Dock icon, or `null` when there is none. */
export function getBadge(): Promise<string | null> {
  return NativeSystem.getBadge();
}

/**
 * Bounces the Dock icon to get the user's attention while the app is in the
 * background. A `critical` request bounces until the app is activated, an
 * informational one once. Does nothing when the app is already active. macOS only.
 */
export function requestAttention(
  options: { critical?: boolean } = {},
): Promise<void> {
  return NativeSystem.requestAttention(options.critical ?? false);
}

/** Stops the bounce that {@link requestAttention} started. */
export function cancelAttention(): Promise<void> {
  return NativeSystem.cancelAttention();
}

export interface JumpListTask {
  /** The label of the entry. */
  title: string;
  /** The arguments the app is started with when the entry is chosen. */
  args?: string[];
  /** The tooltip of the entry. */
  description?: string;
  /** A file with the entry's icon: an `.ico`, or an executable or library with icons. The app's own icon by default. */
  iconPath?: string;
  /** Which icon of `iconPath` to use. */
  iconIndex?: number;
}

/**
 * Sets the tasks in the jump list of the app's taskbar button on Windows, which
 * replace the ones set earlier; an empty list removes them. Choosing a task starts
 * the app with its `args`, and a single-instance app gets them in
 * `App.onSecondInstance`. Windows only: elsewhere it rejects with
 * `ERR_UNSUPPORTED`; on macOS use `Menu.setDockMenu`.
 */
export function setJumpList(tasks: JumpListTask[]): Promise<void> {
  return NativeSystem.setJumpList(tasks);
}

export default {
  getLaunchAtLogin,
  setLaunchAtLogin,
  restart,
  setContentProtected,
  isContentProtected,
  getIdleTime,
  setBadge,
  getBadge,
  requestAttention,
  cancelAttention,
  setJumpList,
};
