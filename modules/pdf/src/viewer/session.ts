import { createKernel } from '@embedpdf/core';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { renderPlugin } from '@embedpdf/plugin-render';
import { searchPlugin } from '@embedpdf/plugin-search';
import { selectionPlugin } from '@embedpdf/plugin-selection';
import { createPdfEngine, nativeTiles } from '../index';

export function createPdfSession() {
  const engine = createPdfEngine({ tiles: nativeTiles() });
  const kernel = createKernel({
    engine,
    plugins: [
      interactionPlugin(),
      renderPlugin(),
      searchPlugin(),
      selectionPlugin(),
    ],
    report: error => console.warn('[pdf]', error),
  });
  const ready = engine.fontsReady.then(() => kernel.start());
  return { engine, kernel, ready };
}

export type PdfSession = ReturnType<typeof createPdfSession>;
