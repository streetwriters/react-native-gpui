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
import { call } from './index';
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
    return call<{ id: string }>('tray', 'install', options);
  },

  destroy(): Promise<{ id: string; destroyed: boolean }> {
    return call('tray', 'destroy', {});
  },

  setTooltip(tooltip: string | null): Promise<unknown> {
    return call('tray', 'setTooltip', { tooltip });
  },

  setVisible(visible: boolean): Promise<unknown> {
    return call('tray', 'setVisible', { visible });
  },

  setIcon(path: string): Promise<unknown> {
    return call('tray', 'setIcon', { path });
  },

  setMenu(items: MenuItemSpec[] | null): Promise<unknown> {
    return call('tray', 'setMenu', { items });
  },

  getState(): Promise<TrayState> {
    return call<TrayState>('tray', 'getState', {});
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
