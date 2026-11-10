import { describe, expect, test } from 'vitest';
import { buildOutline } from './outline';

const ref = (n: number) => ({ kind: 'objectNumber', objectNumber: n });
const item = (
  n: number,
  parent: number | null,
  title: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ref: ref(n),
  parent: parent === null ? null : ref(parent),
  title,
  target: {
    kind: 'goto',
    destination: { kind: 'xyz', page: ref(100 + n), x: 0, y: 40, zoom: null },
  },
  action: null,
  open: false,
  color: null,
  bold: false,
  italic: false,
  ...extra,
});

describe('buildOutline', () => {
  test('nests items under their parents and resolves page indexes', () => {
    const tree = buildOutline(
      [
        item(1, null, 'One', { open: true, bold: true }),
        item(2, 1, 'One.A'),
        item(3, 2, 'One.A.i'),
        item(4, null, 'Two'),
      ] as never,
      page => ((page as { objectNumber: number }).objectNumber - 100) * 10,
    );
    expect(tree.map(node => node.title)).toEqual(['One', 'Two']);
    expect(tree[0].open).toBe(true);
    expect(tree[0].bold).toBe(true);
    expect(tree[0].children[0].children[0]).toMatchObject({
      title: 'One.A.i',
      pageIndex: 30,
      y: 40,
    });
    expect(tree[1].pageIndex).toBe(40);
  });

  test('a missing page or an external link has no page index', () => {
    const tree = buildOutline(
      [
        item(1, null, 'Gone'),
        {
          ...item(2, null, 'Web'),
          target: { kind: 'uri', uri: 'https://example.com' },
        },
        { ...item(3, null, 'Nowhere'), target: null },
      ] as never,
      () => -1,
    );
    expect(tree[0].pageIndex).toBeNull();
    expect(tree[1]).toMatchObject({
      pageIndex: null,
      uri: 'https://example.com',
    });
    expect(tree[2]).toMatchObject({ pageIndex: null, uri: null });
  });
});
