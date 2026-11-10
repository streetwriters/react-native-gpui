export type PageTurn = 0 | 90 | 180 | 270;

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point, Size {}

export function displaySize(size: Size, turn: PageTurn): Size {
  return turn === 90 || turn === 270
    ? { width: size.height, height: size.width }
    : size;
}

export function toDisplayPoint(
  point: Point,
  size: Size,
  turn: PageTurn,
): Point {
  switch (turn) {
    case 90:
      return { x: size.height - point.y, y: point.x };
    case 180:
      return { x: size.width - point.x, y: size.height - point.y };
    case 270:
      return { x: point.y, y: size.width - point.x };
    default:
      return point;
  }
}

export function visibleRectInPage(
  size: Size,
  turn: PageTurn,
  top: number,
  bottom: number,
): Rect {
  const from = Math.max(0, top);
  switch (turn) {
    case 90: {
      const to = Math.min(size.width, bottom);
      return {
        x: from,
        y: 0,
        width: Math.max(0, to - from),
        height: size.height,
      };
    }
    case 270: {
      const to = Math.min(size.width, bottom);
      return {
        x: size.width - to,
        y: 0,
        width: Math.max(0, to - from),
        height: size.height,
      };
    }
    case 180: {
      const to = Math.min(size.height, bottom);
      return {
        x: 0,
        y: size.height - to,
        width: size.width,
        height: Math.max(0, to - from),
      };
    }
    default: {
      const to = Math.min(size.height, bottom);
      return {
        x: 0,
        y: from,
        width: size.width,
        height: Math.max(0, to - from),
      };
    }
  }
}

export function normalizeTurn(value: number | undefined): PageTurn {
  const turn = (((Math.round((value ?? 0) / 90) * 90) % 360) + 360) % 360;
  return turn as PageTurn;
}
