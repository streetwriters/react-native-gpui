/**
 * `react-native-gpui/desktop` — the desktop-shell public API (plan 7.1–7.6).
 *
 * ```ts
 * import {Desktop} from 'react-native-gpui/desktop';
 * ```
 *
 * `Menu`, `ContextMenu`, `Tray`, `DesktopWindow`, `DevMenu` and `PerfMonitor`
 * are added by the feature steps; `Desktop` is the underlying command bridge and
 * is useful on its own for capability checks.
 *
 * @format
 */

export {
  call as desktopCall,
  capabilities,
  DesktopError,
  isDesktopAvailable,
  snapshot as desktopSnapshot,
} from './src-gpui/src/private/desktop';

export type {
  DesktopCapabilities,
  DesktopErrorCode,
} from './src-gpui/src/private/desktop';

import { call, capabilities } from './src-gpui/src/private/desktop';

export interface DesktopAppInfo {
  platform: string;
  arch: string;
  capabilities: ReturnType<typeof capabilities>;
}

/** The underlying command bridge, for callers that need a domain directly. */
export const Desktop = {
  /** Platform, architecture and capability flags. */
  getInfo: () => call<DesktopAppInfo>('app', 'getInfo'),
  /** Platform capability flags without a round trip to the main thread. */
  capabilities,
  /** Run one desktop command. */
  call,
};
