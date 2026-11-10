import { describe, expect, test } from 'vitest';
import {
  displaySize,
  normalizeTurn,
  toDisplayPoint,
  visibleRectInPage,
} from './rotation';

const size = { width: 600, height: 800 };

describe('page turns', () => {
  test('a quarter turn swaps the displayed size', () => {
    expect(displaySize(size, 0)).toEqual(size);
    expect(displaySize(size, 90)).toEqual({ width: 800, height: 600 });
    expect(displaySize(size, 180)).toEqual(size);
    expect(displaySize(size, 270)).toEqual({ width: 800, height: 600 });
  });

  test('corners go where a clockwise turn puts them', () => {
    expect(toDisplayPoint({ x: 0, y: 0 }, size, 90)).toEqual({ x: 800, y: 0 });
    expect(toDisplayPoint({ x: 600, y: 0 }, size, 90)).toEqual({
      x: 800,
      y: 600,
    });
    expect(toDisplayPoint({ x: 0, y: 0 }, size, 180)).toEqual({
      x: 600,
      y: 800,
    });
    expect(toDisplayPoint({ x: 0, y: 0 }, size, 270)).toEqual({ x: 0, y: 600 });
    expect(toDisplayPoint({ x: 600, y: 800 }, size, 270)).toEqual({
      x: 800,
      y: 0,
    });
  });

  test('the visible band is mapped to the page area it shows', () => {
    expect(visibleRectInPage(size, 0, 100, 300)).toEqual({
      x: 0,
      y: 100,
      width: 600,
      height: 200,
    });
    expect(visibleRectInPage(size, 90, 100, 300)).toEqual({
      x: 100,
      y: 0,
      width: 200,
      height: 800,
    });
    expect(visibleRectInPage(size, 180, 100, 300)).toEqual({
      x: 0,
      y: 500,
      width: 600,
      height: 200,
    });
    expect(visibleRectInPage(size, 270, 100, 300)).toEqual({
      x: 300,
      y: 0,
      width: 200,
      height: 800,
    });
    expect(visibleRectInPage(size, 90, -50, 9999)).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 800,
    });
  });

  test('turns are normalized', () => {
    expect(normalizeTurn(undefined)).toBe(0);
    expect(normalizeTurn(-90)).toBe(270);
    expect(normalizeTurn(450)).toBe(90);
  });
});
