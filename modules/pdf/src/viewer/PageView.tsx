import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { PixelRatio, View } from 'react-native';
import type { Kernel, PageInfo, PageRef } from '@embedpdf/core';
import {
  RenderToken,
  type ViewDemand,
} from '@embedpdf/plugin-render/contract/host';
import { PdfTile } from '../native-tiles';
import { tileIdOf } from '../tiles';

interface Props {
  kernel: Kernel;
  documentId: string;
  page: PageInfo;
  zoom: number;
  visible: { top: number; bottom: number };
  background?: string;
}

function tileOf(handle: { source: { kind: string; bytes?: Uint8Array } }) {
  return handle.source.kind === 'bytes' && handle.source.bytes
    ? tileIdOf(handle.source.bytes)
    : null;
}

function Sprite({
  id,
  left,
  top,
  width,
  height,
  z,
  view,
  pageRef,
  tileKey,
}: {
  id: number;
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
  view: ViewDemand;
  pageRef: PageRef;
  tileKey: string;
}) {
  useEffect(() => {
    view.markPainted(pageRef, tileKey);
    return () => view.markUnpainted(pageRef, tileKey);
  }, [view, pageRef, tileKey]);
  return (
    <PdfTile
      tileId={id}
      pointerEvents="none"
      style={{ position: 'absolute', left, top, width, height, zIndex: z }}
    />
  );
}

export function PageView({
  kernel,
  documentId,
  page,
  zoom,
  visible,
  background = '#ffffff',
}: Props) {
  const render = kernel.capability(RenderToken, documentId);
  const dpr = PixelRatio.get();
  const width = page.size.width * zoom;
  const height = page.size.height * zoom;
  const viewId = `view:${documentId}`;
  const view = useMemo(() => render.createViewDemand(viewId), [render, viewId]);
  useEffect(() => () => view.destroy(), [view]);

  const rect = useMemo(
    () => ({
      x: 0,
      y: Math.max(0, visible.top / zoom),
      width: page.size.width,
      height: Math.max(
        0,
        Math.min(page.size.height, visible.bottom / zoom) -
          Math.max(0, visible.top / zoom),
      ),
    }),
    [visible.top, visible.bottom, zoom, page.size.width, page.size.height],
  );

  useLayoutEffect(() => {
    view.setDemand(page.ref, {
      desiredDeviceWidth: width * dpr,
      visibleRect: rect,
    });
  });
  useEffect(() => () => view.release(page.ref), [view, page.ref]);

  const subscribe = useMemo(() => kernel.subscribe.bind(kernel), [kernel]);
  const plan = useSyncExternalStore(subscribe, () => view.getPlan(page.ref));

  const scale = (width * dpr) / page.size.width;
  const key = render.getSourceKey(page.ref, { scale, view: viewId });
  const [base, setBase] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    render
      .renderSource(page.ref, {
        scale,
        view: viewId,
        signal: controller.signal,
      })
      .then(handle => {
        if (!controller.signal.aborted) setBase(tileOf(handle));
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the identity
  }, [render, page.ref, key]);

  return (
    <View
      pointerEvents="none"
      style={{ width, height, backgroundColor: background, overflow: 'hidden' }}
    >
      {base !== null ? (
        <PdfTile
          tileId={base}
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
        />
      ) : null}
      {plan.paint.map(entry => {
        const id = tileOf(entry.handle);
        if (id === null) return null;
        return (
          <Sprite
            key={entry.key}
            id={id}
            left={entry.rect.x * zoom}
            top={entry.rect.y * zoom}
            width={entry.rect.width * zoom}
            height={entry.rect.height * zoom}
            z={entry.z + 1}
            view={view}
            pageRef={page.ref}
            tileKey={entry.key}
          />
        );
      })}
    </View>
  );
}
