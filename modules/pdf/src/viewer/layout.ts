export const PAGE_GAP = 12;
export const PAGE_PADDING = 16;

export interface PageSize {
  width: number;
  height: number;
}

export interface PageBox {
  top: number;
  width: number;
  height: number;
}

export function layoutPages(
  sizes: readonly PageSize[],
  zoom: number,
  gap = PAGE_GAP,
  padding = PAGE_PADDING,
) {
  const boxes: PageBox[] = [];
  let top = padding;
  for (const size of sizes) {
    const width = size.width * zoom;
    const height = size.height * zoom;
    boxes.push({ top, width, height });
    top += height + gap;
  }
  return { boxes, height: top - gap + padding };
}

export function visibleRange(
  boxes: readonly PageBox[],
  offset: number,
  viewport: number,
  margin: number,
) {
  const from = offset - margin;
  const to = offset + viewport + margin;
  let first = -1;
  let last = -1;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (box.top + box.height < from) continue;
    if (box.top > to) break;
    if (first === -1) first = index;
    last = index;
  }
  return first === -1 ? { first: 0, last: -1 } : { first, last };
}

export function currentPage(
  boxes: readonly PageBox[],
  contentHeight: number,
  offset: number,
  viewport: number,
) {
  if (boxes.length === 0) return 0;
  if (viewport > 0 && offset + viewport >= contentHeight - 1 && offset > 0) {
    return boxes.length - 1;
  }
  const bottom = offset + viewport;
  let best = 0;
  let bestArea = -1;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (box.top > bottom) break;
    const visible =
      Math.min(bottom, box.top + box.height) - Math.max(offset, box.top);
    const area = visible * box.width;
    if (area > bestArea) {
      best = index;
      bestArea = area;
    }
  }
  return best;
}

export function fitZoom(
  sizes: readonly PageSize[],
  viewport: PageSize,
  mode: 'width' | 'page',
  current: number,
  padding = PAGE_PADDING,
) {
  if (sizes.length === 0 || viewport.width <= 0) return current;
  const widest = Math.max(...sizes.map(size => size.width));
  const byWidth = (viewport.width - padding * 2) / widest;
  if (mode === 'width') return byWidth;
  const tallest = Math.max(...sizes.map(size => size.height));
  return Math.min(byWidth, (viewport.height - padding * 2) / tallest);
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
