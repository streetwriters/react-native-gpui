import { createKernel } from '@embedpdf/core';
import { renderPlugin } from '@embedpdf/plugin-render';
import { createPdfEngine, nativeTiles } from '../index';

export function createPdfSession() {
  const engine = createPdfEngine({ tiles: nativeTiles() });
  const kernel = createKernel({
    engine,
    plugins: [renderPlugin()],
    report: error => console.warn('[pdf]', error),
  });
  const ready = engine.fontsReady.then(() => kernel.start());
  return { engine, kernel, ready };
}

export type PdfSession = ReturnType<typeof createPdfSession>;
