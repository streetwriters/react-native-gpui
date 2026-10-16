/**
 * `Tray` — menu-bar (tray) apps.
 *
 * ```ts
 * await Tray.install({ component: 'MenuBarPanel', tooltip: 'My app' });
 * ```
 *
 * The icon's click opens `component` in a popover window; a menu shown instead
 * reports its selection as the `gpuiDesktop:trayMenuPress` device event, which
 * {@link Tray.onMenuPress} subscribes to.
 *
 * Platform notes: Windows has no anchored popover (the window is placed at the
 * click point), and on GNOME a Linux AppIndicator only supports menus, not
 * click-to-popover.
 *
 * @format
 */

import { DeviceEventEmitter } from 'react-native';
import NativeGpuiTray from '../specs/NativeGpuiTray';
import { DesktopError, toDesktopError } from './index';

/** The module, or an error when the app has no desktop shell. */
function trayModule() {
  if (NativeGpuiTray == null) {
    throw new DesktopError(
      'unsupported',
      'the GpuiTray native module is not available',
    );
  }
  return NativeGpuiTray;
}

async function request<T>(
  run: (native: typeof NativeGpuiTray) => Promise<T>,
): Promise<T> {
  try {
    return await run(trayModule());
  } catch (error) {
    throw toDesktopError(error);
  }
}
import type { MenuItemSpec } from './menu';

export interface TrayOptions {
  /** Stable id; defaults to `tray`. */
  id?: string;
  tooltip?: string;
  title?: string;
  component?: string;
  size?: { width: number; height: number };
  menu?: MenuItemSpec[];
  menuOnLeftClick?: boolean;
  /** Keep the app alive when its last window closes. Defaults to true. */
  quitOnLastWindowClosed?: boolean;
}

export interface TrayState {
  installed: boolean;
  id?: string;
  tooltip?: string | null;
  visible?: boolean;
  component?: string | null;
  popover?: number | null;
  clicks?: number;
  hasMenu?: boolean;
  menuItems?: unknown[];
}

const MENU_PRESS_EVENT = 'gpuiDesktop:trayMenuPress';

export const Tray = {
  install(options: TrayOptions = {}): Promise<{ id: string }> {
    return request(native =>
      native.trayInstall({
        ...options,
        menu: options.menu as unknown as Object[] | undefined,
      }),
    );
  },

  destroy(): Promise<void> {
    return request(native => native.trayDestroy());
  },

  setTooltip(tooltip: string | null): Promise<void> {
    return request(native => native.traySetTooltip(tooltip));
  },

  setVisible(visible: boolean): Promise<void> {
    return request(native => native.traySetVisible(visible));
  },

  setIcon(path: string): Promise<void> {
    return request(native => native.traySetIcon(path));
  },

  setMenu(items: MenuItemSpec[] | null): Promise<void> {
    return request(native =>
      native.traySetMenu(items as unknown as Object[] | null),
    );
  },

  getState(): Promise<TrayState> {
    return request(native => native.trayGetState()) as Promise<TrayState>;
  },

  onMenuPress(handler: (id: string) => void): { remove: () => void } {
    const subscription = DeviceEventEmitter.addListener(
      MENU_PRESS_EVENT,
      (event: { id?: string }) => {
        if (event?.id != null) {
          handler(event.id);
        }
      },
    );
    return { remove: () => subscription.remove() };
  },
};
