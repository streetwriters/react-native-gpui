import { expect, test } from 'vitest';
import { MAX_TILE_BUDGET, MIN_TILE_BUDGET, tileBudget } from './budget';

test('the tile budget is about three screens of pixels, within limits', () => {
  expect(tileBudget({ width: 1024, height: 768 }, 2)).toBe(
    1024 * 2 * 768 * 2 * 4 * 3,
  );
  expect(tileBudget({ width: 300, height: 200 }, 1)).toBe(MIN_TILE_BUDGET);
  expect(tileBudget({ width: 3840, height: 2160 }, 2)).toBe(MAX_TILE_BUDGET);
  expect(tileBudget({ width: 1024, height: 768 }, 2, 6)).toBeGreaterThan(
    tileBudget({ width: 1024, height: 768 }, 2, 3),
  );
});
