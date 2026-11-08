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

export default {
  getLaunchAtLogin,
  setLaunchAtLogin,
  restart,
  setContentProtected,
  isContentProtected,
  getIdleTime,
};
