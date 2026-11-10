import type { createLocalEngine } from '@embedpdf/engine';

export async function registerFallbackFonts(
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
