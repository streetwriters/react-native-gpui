import { Platform } from 'react-native';
import { createPdfRuntimeFromAddon, NULL_PTR } from './runtime';

type Addon = Record<string, any>;

const loaders: Record<string, () => Addon> = {
  'darwin-arm64': () =>
    require('@embedpdf/engine-runtime-darwin-arm64/lib/pdf-runtime.node'),
  'darwin-x64': () =>
    require('@embedpdf/engine-runtime-darwin-x64/lib/pdf-runtime.node'),
  'linux-arm64': () =>
    require('@embedpdf/engine-runtime-linux-arm64/lib/pdf-runtime.node'),
  'linux-x64': () =>
    require('@embedpdf/engine-runtime-linux-x64/lib/pdf-runtime.node'),
  'win32-arm64': () =>
    require('@embedpdf/engine-runtime-win32-arm64/lib/pdf-runtime.node'),
  'win32-x64': () =>
    require('@embedpdf/engine-runtime-win32-x64/lib/pdf-runtime.node'),
};

export function resolveRuntimeTarget(): string {
  const os =
    Platform.OS === 'macos'
      ? 'darwin'
      : Platform.OS === 'windows'
        ? 'win32'
        : 'linux';
  const arch = (Platform as { constants?: { arch?: string } }).constants?.arch;
  return `${os}-${arch === 'arm64' ? 'arm64' : 'x64'}`;
}

export function packageNameForTarget(target: string): string {
  return `@embedpdf/engine-runtime-${target}`;
}

export async function createPdfRuntime() {
  const platform = resolveRuntimeTarget();
  const load = loaders[platform];
  if (!load) throw new Error(`no PDF runtime for ${platform}`);
  return createPdfRuntimeFromAddon(load(), platform);
}

export const init = createPdfRuntime;
export { NULL_PTR };
