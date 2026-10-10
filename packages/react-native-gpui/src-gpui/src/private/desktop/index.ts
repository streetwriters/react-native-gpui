/**
 * JS side of the core `GpuiDesktop` TurboModule.
 *
 * Every command is a method on the module, and the public modules in
 * `react-native-gpui/desktop` are thin typed wrappers over them. Nothing here
 * reaches into GPUI; it only runs a method and normalises the rejection shape.
 *
 * @format
 */

import { TurboModuleRegistry } from 'react-native';
import type { DesktopCapabilities, Spec } from '../specs/NativeGpuiDesktop';

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

const CODES: readonly string[] = [
  'unsupported',
  'invalid_argument',
  'not_found',
  'reloaded',
  'failed',
];

/**
 * Turn a rejection into a `DesktopError`. A Rust module rejects with the error's
 * code on the JS error object; anything else keeps its message.
 */
function toDesktopError(error: unknown): DesktopError {
  if (error instanceof DesktopError) {
    return error;
  }
  const code =
    typeof error === 'object' && error != null
      ? (error as { code?: unknown }).code
      : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error != null &&
          typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : String(error);
  return new DesktopError(
    typeof code === 'string' && CODES.includes(code)
      ? (code as DesktopErrorCode)
      : 'failed',
    message,
  );
}

/** The module, or an error when the app has no desktop shell. */
export function desktopModule(): Spec {
  if (NativeGpuiDesktop == null) {
    throw new DesktopError(
      'unsupported',
      'the GpuiDesktop native module is not available',
    );
  }
  return NativeGpuiDesktop;
}

/** Runs one module method, turning its rejection into a `DesktopError`. */
export async function request<T>(
  run: (native: Spec) => Promise<T>,
): Promise<T> {
  try {
    return await run(desktopModule());
  } catch (error) {
    throw toDesktopError(error);
  }
}

const NO_CAPABILITIES: DesktopCapabilities = {
  nativeAppMenu: false,
  nativeContextMenu: false,
  tray: false,
  trayPopoverAnchored: false,
  windowPosition: false,
  alwaysOnTop: false,
  transparentTitlebar: false,
};

/** Read synchronously; never touches the GPUI main thread. */
export function capabilities(): DesktopCapabilities {
  return NativeGpuiDesktop?.capabilities() ?? NO_CAPABILITIES;
}

/** The host platform, or `null` without a desktop shell. */
export function platform(): string | null {
  return NativeGpuiDesktop?.platform() ?? null;
}

export type { DesktopCapabilities };
