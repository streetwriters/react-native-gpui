/**
 * JS side of the core `GpuiDesktop` TurboModule.
 *
 * The public modules in `react-native-gpui/desktop` are thin typed wrappers over
 * `call()`. Nothing here reaches into GPUI; it only serialises a command and
 * normalises the `{code, message}` rejection shape.
 *
 * @format
 */

import { TurboModuleRegistry } from 'react-native';
import type { Spec } from '../specs/NativeGpuiDesktop';

const NativeGpuiDesktop = TurboModuleRegistry.get<Spec>('GpuiDesktop');

export type DesktopErrorCode =
  'unsupported' | 'invalid_argument' | 'not_found' | 'reloaded' | 'failed';

export class DesktopError extends Error {
  readonly code: DesktopErrorCode;

  constructor(code: DesktopErrorCode, message: string) {
    super(message);
    this.name = 'DesktopError';
    this.code = code;
  }
}

export const isDesktopAvailable = NativeGpuiDesktop != null;

/**
 * Turn a rejection into a `DesktopError`. The native side rejects with the JSON
 * encoding of `{code, message}`, because a JS promise rejection only carries a
 * message string.
 */
function toDesktopError(error: unknown): DesktopError {
  // The rejection may be an `Error`, a bare JSON string, or an object whose
  // `message` holds the JSON, depending on how the promise was settled.
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error != null &&
          typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : String(error);
  try {
    const parsed = JSON.parse(raw) as { code?: string; message?: string };
    if (parsed && typeof parsed.code === 'string') {
      return new DesktopError(
        parsed.code as DesktopErrorCode,
        parsed.message ?? raw,
      );
    }
  } catch {}
  return new DesktopError('failed', raw);
}

export async function call<T = unknown>(
  domain: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (NativeGpuiDesktop == null) {
    throw new DesktopError(
      'unsupported',
      'the GpuiDesktop native module is not available',
    );
  }
  try {
    const result = await NativeGpuiDesktop.call(
      domain,
      method,
      JSON.stringify(args),
    );
    return JSON.parse(result) as T;
  } catch (error) {
    throw toDesktopError(error);
  }
}

export function snapshot<T = unknown>(key: string): T | null {
  if (NativeGpuiDesktop == null) {
    return null;
  }
  try {
    return JSON.parse(NativeGpuiDesktop.getSnapshot(key)) as T;
  } catch {
    return null;
  }
}

export interface DesktopCapabilities {
  nativeAppMenu: boolean;
  nativeContextMenu: boolean;
  tray: boolean;
  trayPopoverAnchored: boolean;
  windowPosition: boolean;
  alwaysOnTop: boolean;
  transparentTitlebar: boolean;
}

export function capabilities(): DesktopCapabilities {
  return (
    snapshot<DesktopCapabilities>('capabilities') ?? {
      nativeAppMenu: false,
      nativeContextMenu: false,
      tray: false,
      trayPopoverAnchored: false,
      windowPosition: false,
      alwaysOnTop: false,
      transparentTitlebar: false,
    }
  );
}
