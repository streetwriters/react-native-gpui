/**
 * `PerfMonitor` — the host-drawn performance overlay (plan item 7.6, §9.1).
 *
 * The overlay is painted by GPUI above every surface, so it never competes with
 * what it measures. JS only toggles it and reports its own frame rate.
 *
 * @format
 */

import { call } from './index';

export interface PerfMetrics {
  enabled: boolean;
  /** Frames the window presented in the last second. */
  uiFps: number;
  /** `requestAnimationFrame` ticks JS reported for the last second. */
  jsFps: number;
  memoryBytes: number;
  mountedViews: number;
  lastMountMs: number;
}

let ticking = false;
let frames = 0;
let ticker: ReturnType<typeof setInterval> | null = null;

let nativeBridgeInstalled = false;

/**
 * The native side can turn the overlay on by itself (the Dev Menu's "Toggle Perf
 * Monitor", `DevSettings.setProfilingEnabled`). JS owns the frame counter that
 * reports JS FPS, so it has to follow.
 */
function installNativeBridge(): void {
  if (nativeBridgeInstalled) {
    return;
  }
  nativeBridgeInstalled = true;
  // Resolved lazily: the desktop entry loads this module while `react-native`
  // is still initializing, and the package's exports are not populated yet.
  const { DeviceEventEmitter } = require('react-native');
  DeviceEventEmitter.addListener(
    'gpuiDesktop:perfMonitor',
    (event: { enabled?: boolean }) => {
      if (event?.enabled) {
        startJsTicker();
      } else {
        stopJsTicker();
      }
    },
  );
}

/**
 * Install the listener for the native toggle. Called from the desktop entry's
 * startup path rather than at import time: this module is imported while
 * `react-native` is still initializing, and `DeviceEventEmitter` is not
 * available on the package export until then.
 */
export function installPerfMonitorBridge(): void {
  installNativeBridge();
}

function startJsTicker(): void {
  if (ticking) {
    return;
  }
  ticking = true;
  frames = 0;
  const onFrame = () => {
    if (!ticking) {
      return;
    }
    frames += 1;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
  // One report per second: a bridge call per frame would distort what the
  // monitor measures.
  ticker = setInterval(() => {
    const count = frames;
    frames = 0;
    call('perfMonitor', 'jsTicks', { count }).catch(() => {});
  }, 1000);
}

function stopJsTicker(): void {
  ticking = false;
  if (ticker != null) {
    clearInterval(ticker);
    ticker = null;
  }
}

export const PerfMonitor = {
  /** Show or hide the overlay. Enabling starts the JS frame counter. */
  async setEnabled(enabled: boolean): Promise<boolean> {
    const result = await call<{ enabled: boolean }>(
      'perfMonitor',
      'setEnabled',
      {
        enabled,
      },
    );
    if (result.enabled) {
      startJsTicker();
    } else {
      stopJsTicker();
    }
    return result.enabled;
  },

  async isEnabled(): Promise<boolean> {
    const metrics = await call<PerfMetrics>('perfMonitor', 'getMetrics');
    return metrics.enabled;
  },

  /** A snapshot of the counters, for tests and diagnostics. */
  getMetrics(): Promise<PerfMetrics> {
    return call<PerfMetrics>('perfMonitor', 'getMetrics');
  },

  async toggle(): Promise<boolean> {
    const enabled = await PerfMonitor.isEnabled();
    return PerfMonitor.setEnabled(!enabled);
  },
};
