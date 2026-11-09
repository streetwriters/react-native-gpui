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

export function layoutPages(sizes: readonly PageSize[], zoom: number) {
  const boxes: PageBox[] = [];
  let top = PAGE_PADDING;
  for (const size of sizes) {
    const width = size.width * zoom;
    const height = size.height * zoom;
    boxes.push({ top, width, height });
    top += height + PAGE_GAP;
  }
  return { boxes, height: top - PAGE_GAP + PAGE_PADDING };
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

export function pageAt(boxes: readonly PageBox[], y: number) {
  let found = 0;
  for (let index = 0; index < boxes.length; index++) {
    if (boxes[index].top <= y) found = index;
    else break;
  }
  return found;
}

export function fitZoom(
  sizes: readonly PageSize[],
  viewport: PageSize,
  mode: 'width' | 'page',
  current: number,
) {
  if (sizes.length === 0 || viewport.width <= 0) return current;
  const widest = Math.max(...sizes.map(size => size.width));
  const byWidth = (viewport.width - PAGE_PADDING * 2) / widest;
  if (mode === 'width') return byWidth;
  const tallest = Math.max(...sizes.map(size => size.height));
  return Math.min(byWidth, (viewport.height - PAGE_PADDING * 2) / tallest);
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
