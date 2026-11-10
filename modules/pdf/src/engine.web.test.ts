import { describe, expect, test } from 'vitest';
import { createPdfEngine } from './engine.web';

function pdf(pageCount: number): Uint8Array {
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`,
    ...kids.map(
      () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>',
    ),
  ];
  let text = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(text, c => c.charCodeAt(0));
}

describe('the web engine', () => {
  test('opens a document on the WASM runtime and lists its pages', async () => {
    const engine = createPdfEngine({ fallbackFonts: false });
    await engine.fontsReady;
    const doc = await engine.open({ kind: 'bytes', bytes: pdf(3) } as never);
    const snapshot = await doc.pages.list();
    expect(snapshot.pageCount).toBe(3);
    expect(snapshot.pages[0].size).toEqual({ width: 300, height: 400 });
    await doc.close();
    await engine.destroy();
  });
});
