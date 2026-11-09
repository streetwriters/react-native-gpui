import { createLocalEngine } from '@embedpdf/engine';
import { setTileSink } from './native-runtime';
import { createTileImageEncoder, type TileSink } from './tiles';

export * from '@embedpdf/engine';
export { createPdfRuntimeFromAddon } from './runtime';
export { createPdfRuntime, resolveRuntimeTarget } from './native-runtime';
export {
  createTileImageEncoder,
  tileIdOf,
  tileToken,
  TILE_MIME,
  type TileSink,
} from './tiles';

export interface PdfEngineOptions extends Omit<
  NonNullable<Parameters<typeof createLocalEngine>[0]>,
  'runtime'
> {
  tiles?: TileSink;
}

export function createPdfEngine({ tiles, ...options }: PdfEngineOptions = {}) {
  setTileSink(tiles ?? null);
  return createLocalEngine(
    tiles ? { imageEncoder: createTileImageEncoder(), ...options } : options,
  );
}
