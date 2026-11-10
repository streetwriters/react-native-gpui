import { createCapabilityToken, definePlugin } from '@embedpdf/core';
import type { OutlineItem } from '@embedpdf/engine-core/runtime';

export interface PdfOutlineItem {
  title: string;
  pageIndex: number | null;
  y: number | null;
  uri: string | null;
  open: boolean;
  bold: boolean;
  italic: boolean;
  color: string | null;
  children: PdfOutlineItem[];
}

export interface OutlineCapability {
  read(
    documentId: string,
    pageIndexOf: (page: unknown) => number,
  ): Promise<PdfOutlineItem[]>;
}

export const OutlineToken = createCapabilityToken<OutlineCapability>(
  'rn-gpui-outline',
  { promises: { read: true } },
);

const keyOf = (ref: unknown) => JSON.stringify(ref);

export function buildOutline(
  items: readonly OutlineItem[],
  pageIndexOf: (page: unknown) => number,
): PdfOutlineItem[] {
  const nodes = new Map<string, PdfOutlineItem>();
  const roots: PdfOutlineItem[] = [];
  for (const item of items) {
    const target = item.target;
    const destination = target?.kind === 'goto' ? target.destination : null;
    const index = destination ? pageIndexOf(destination.page) : -1;
    const y =
      destination && 'y' in destination && typeof destination.y === 'number'
        ? destination.y
        : null;
    const node: PdfOutlineItem = {
      title: item.title,
      pageIndex: index >= 0 ? index : null,
      y,
      uri: target?.kind === 'uri' ? target.uri : null,
      open: item.open,
      bold: item.bold,
      italic: item.italic,
      color: item.color,
      children: [],
    };
    nodes.set(keyOf(item.ref), node);
    const parent = item.parent ? nodes.get(keyOf(item.parent)) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export const outlinePlugin = () =>
  definePlugin({
    id: 'rn-gpui-outline',
    token: OutlineToken,
    scope: 'workspace',
    create: ctx => ({
      api: {
        async read(documentId, pageIndexOf) {
          const handle = ctx.documentHandle(documentId);
          if (!handle) return [];
          const outline = await handle.outline.get();
          return buildOutline(outline.items, pageIndexOf);
        },
      },
    }),
  });
