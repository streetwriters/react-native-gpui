export const MIN_TILE_BUDGET = 16 * 1024 * 1024;
export const MAX_TILE_BUDGET = 128 * 1024 * 1024;
export const TILE_SCREENS = 3;

export function tileBudget(
  viewport: { width: number; height: number },
  pixelRatio: number,
  screens = TILE_SCREENS,
): number {
  const screen = viewport.width * pixelRatio * viewport.height * pixelRatio * 4;
  const wanted = Math.round(screen * screens);
  return Math.min(MAX_TILE_BUDGET, Math.max(MIN_TILE_BUDGET, wanted));
}
