import { createPdfRuntimeFromAddon, NULL_PTR } from './runtime';
import { selectFirst } from './select';
import { withNativeTiles, type TileSink } from './tiles';

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

export function packageNameForTarget(target: string): string {
  return `@embedpdf/engine-runtime-${target}`;
}

let selected: { name: string; value: Addon } | null = null;

export function resolveRuntimeTarget(): string {
  selected ??= selectFirst(Object.entries(loaders));
  return selected.name;
}

let tileSink: TileSink | null = null;

export function setTileSink(sink: TileSink | null) {
  tileSink = sink;
}

export async function createPdfRuntime() {
  const platform = resolveRuntimeTarget();
  const runtime = createPdfRuntimeFromAddon(selected!.value, platform);
  return tileSink ? withNativeTiles(runtime, tileSink) : runtime;
}

export const init = createPdfRuntime;
export { NULL_PTR };
