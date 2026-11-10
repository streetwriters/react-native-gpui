import { createLocalEngine } from '@embedpdf/engine';
import { registerFallbackFonts } from './fallback-fonts';

export interface PdfEngineOptions extends NonNullable<
  Parameters<typeof createLocalEngine>[0]
> {
  fallbackFonts?: boolean;
}

export type PdfEngine = ReturnType<typeof createLocalEngine> & {
  fontsReady: Promise<void>;
};

export function createPdfEngine({
  fallbackFonts = true,
  ...options
}: PdfEngineOptions = {}): PdfEngine {
  const engine = createLocalEngine(options) as PdfEngine;
  engine.fontsReady = fallbackFonts
    ? registerFallbackFonts(engine)
    : Promise.resolve();
  return engine;
}

export function nativeTiles() {
  return undefined;
}

export function assertSecureRandom() {
  const source = (globalThis as { crypto?: { getRandomValues?: unknown } })
    .crypto;
  if (typeof source?.getRandomValues !== 'function') {
    throw new Error('This browser has no crypto.getRandomValues.');
  }
}
