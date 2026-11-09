import './polyfills';
import { createLocalEngine } from '@embedpdf/engine';
import { setTileSink } from './native-runtime';
import { createTileImageEncoder, type TileSink } from './tiles';

export * from '@embedpdf/engine';
export { createPdfRuntimeFromAddon } from './runtime';
export { createPdfRuntime, resolveRuntimeTarget } from './native-runtime';

export function nativeTiles() {
  return (require('./native-tiles') as typeof import('./native-tiles'))
    .nativeTileSink;
}
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
  fallbackFonts?: boolean;
}

export type PdfEngine = ReturnType<typeof createLocalEngine> & {
  fontsReady: Promise<void>;
};

async function registerFallbackFonts(
  engine: ReturnType<typeof createLocalEngine>,
) {
  const { DEFAULT_FALLBACK_FONTS, loadFallbackFont } =
    await import('@embedpdf/default-fallback-fonts/library');
  for (const font of DEFAULT_FALLBACK_FONTS) {
    const data = await loadFallbackFont(font.key);
    await engine.fonts.register({
      key: font.key,
      familyName: font.familyName,
      weight: font.weight,
      italic: font.italic,
      data,
    });
    await engine.fonts.addFallback(font.key);
  }
}

export function createPdfEngine({
  tiles,
  fallbackFonts = true,
  ...options
}: PdfEngineOptions = {}): PdfEngine {
  setTileSink(tiles ?? null);
  const engine = createLocalEngine(
    tiles ? { imageEncoder: createTileImageEncoder(), ...options } : options,
  ) as PdfEngine;
  engine.fontsReady = fallbackFonts
    ? registerFallbackFonts(engine)
    : Promise.resolve();
  return engine;
}

export {
  PdfViewer,
  type PdfFit,
  type PdfSource,
  type PdfViewerController,
  type PdfViewerProps,
  type PdfViewerState,
} from './viewer/PdfViewer';
