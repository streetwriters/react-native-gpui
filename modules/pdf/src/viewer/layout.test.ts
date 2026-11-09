import { describe, expect, test } from 'vitest';
import { currentPage, fitZoom, layoutPages } from './layout';

const pages = Array.from({ length: 10 }, () => ({ width: 300, height: 300 }));

describe('currentPage', () => {
  const { boxes, height } = layoutPages(pages, 1, 12, 16);

  test('is the first page at the top, even when the second is as visible', () => {
    expect(currentPage(boxes, height, 0, 700)).toBe(0);
  });

  test('is the page that fills most of the viewport', () => {
    const offset = boxes[2].top + 150 - 350;
    expect(currentPage(boxes, height, offset, 700)).toBe(2);
    expect(currentPage(boxes, height, boxes[4].top, 300)).toBe(4);
  });

  test('is the last page at the bottom', () => {
    expect(currentPage(boxes, height, height - 700, 700)).toBe(9);
  });

  test('ties go to the first page', () => {
    expect(currentPage(boxes, height, boxes[1].top - 6, 600)).toBe(1);
    expect(currentPage(boxes, height, 316 - 150, 300)).toBe(0);
  });

  test('handles no pages', () => {
    expect(currentPage([], 0, 0, 700)).toBe(0);
  });
});

describe('layout options', () => {
  test('gap and padding move the pages and the content height', () => {
    const a = layoutPages(pages.slice(0, 2), 1);
    const b = layoutPages(pages.slice(0, 2), 1, 8, 10);
    expect(a.boxes[0].top).toBe(16);
    expect(b.boxes[0].top).toBe(10);
    expect(b.boxes[1].top).toBe(10 + 300 + 8);
    expect(b.height).toBe(10 + 300 + 8 + 300 + 10);
  });

  test('fit width leaves the padding on each side', () => {
    expect(fitZoom(pages, { width: 620, height: 800 }, 'width', 1, 10)).toBe(2);
  });
});
