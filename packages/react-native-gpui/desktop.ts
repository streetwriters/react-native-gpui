/**
 * `react-native-gpui/desktop` — the desktop-shell public API.
 *
 * ```ts
 * import {Desktop} from 'react-native-gpui/desktop';
 * ```
 *
 * `Menu`, `ContextMenu`, `Tray`, `DesktopWindow` and `PerfMonitor` are added by
 * the feature steps; `Desktop` covers app info and capability checks. Each of
 * them calls a method of the `GpuiDesktop` TurboModule, whose spec lists every
 * command the shell accepts.
 *
 * @format
 */

export {
  capabilities,
  DesktopError,
  desktopModule,
  isDesktopAvailable,
  platform,
  request,
} from './src-gpui/src/private/desktop';

export type {
  DesktopCapabilities,
  DesktopErrorCode,
} from './src-gpui/src/private/desktop';

export {
  DesktopWindow,
  useDesktopWindow,
} from './src-gpui/src/private/desktop/windows';

export type {
  OpenWindowOptions,
  Subscription,
  WindowBounds,
  WindowEvent,
  WindowEventName,
  WindowState,
} from './src-gpui/src/private/desktop/windows';

export {
  installDesktopWindowContext,
  MAIN_WINDOW_ID,
  useDesktopWindowId,
} from './src-gpui/src/private/desktop/windowContext';

export { TitleBar } from './src-gpui/src/private/desktop/TitleBar';

export type { TitleBarProps } from './src-gpui/src/private/desktop/TitleBar';

export { ApplicationMenu, Menu } from './src-gpui/src/private/desktop/menu';

export {
  ContextMenu,
  ContextMenuView,
} from './src-gpui/src/private/desktop/contextMenu';

export { PerfMonitor } from './src-gpui/src/private/desktop/perfMonitor';

export { Tray } from './src-gpui/src/private/desktop/tray';

export type {
  TrayOptions,
  TrayState,
} from './src-gpui/src/private/desktop/tray';

export type { PerfMetrics } from './src-gpui/src/private/desktop/perfMonitor';

export type {
  ContextMenuEvent,
  ContextMenuOptions,
  ContextMenuViewProps,
} from './src-gpui/src/private/desktop/contextMenu';

export type {
  ApplicationMenuProps,
  MenuDescription,
  MenuItemPatch,
  MenuItemSpec,
  MenuPressEvent,
  MenuRole,
} from './src-gpui/src/private/desktop/menu';

import './src-gpui/src/private/desktop/types';

import { capabilities, request } from './src-gpui/src/private/desktop';
import type { DesktopAppInfo } from './src-gpui/src/private/specs/NativeGpuiDesktop';

export type { DesktopAppInfo };

export const Desktop = {
  getInfo: () => request(native => native.appInfo()),
  capabilities,
};
