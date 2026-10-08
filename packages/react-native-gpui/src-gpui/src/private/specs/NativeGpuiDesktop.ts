/**
 * Core desktop-shell TurboModule (plan 7.1–7.6, design §3.2).
 *
 * One module carries every desktop-shell call as a `(domain, method, argsJson)`
 * triple so the native surface stays small and all logic lives in Rust, where
 * the GPUI main thread is. Public JS modules (`Menu`, `ContextMenu`, `Tray`,
 * `DesktopWindow`, `DevMenu`, `PerfMonitor`) are thin typed wrappers over this.
 *
 * This file is the codegen spec: `rn-gpui-sys/scripts/generate-fbreactnativespec.cjs`
 * merges `src-gpui/src/private/specs` into the FBReactNativeSpec bundle so the
 * generated `NativeGpuiDesktopCxxSpec` base class exists for
 * `cpp/GpuiDesktopModule.cpp`. The JS wrapper never imports this module at
 * runtime (type-only import), so `getEnforcing` cannot throw during startup.
 *
 * @format
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Run one desktop-shell command. Resolves with a JSON string; rejects with
   * `{code, message}` (see the error table in the plan, §3.4).
   */
  call(domain: string, method: string, argsJson: string): Promise<string>;

  /**
   * Read a value that must be available synchronously (capability flags, the
   * calling surface's window id). Reads a snapshot; never touches the GPUI
   * main thread. Returns a JSON string.
   */
  getSnapshot(key: string): string;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GpuiDesktop');
