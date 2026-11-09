import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { PixelRatio, View, type PointerEvent } from 'react-native';
import type { Kernel, PageInfo, PageRef } from '@embedpdf/core';
import type { SearchHit } from '@embedpdf/plugin-search';
import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';
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
  hits: readonly SearchHit[];
  activeHit: SearchHit | null;
  selectionVersion: number;
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
  hits,
  activeHit,
  selectionVersion,
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

  const selection = kernel.tryCapability(SelectionToken, documentId);
  const selectionRects = selection ? selection.listRects(page.ref) : [];
  void selectionVersion;
  const pressed = useRef(false);
  const lastDown = useRef({ time: 0, x: 0, y: 0, count: 0 });
  const at = (event: PointerEvent) => ({
    x: event.nativeEvent.offsetX / zoom,
    y: event.nativeEvent.offsetY / zoom,
  });
  const responder = selection
    ? {
        onPointerDown: (event: PointerEvent) => {
          const point = at(event);
          const now = Date.now();
          const last = lastDown.current;
          const clicks =
            now - last.time < 450 &&
            Math.hypot(point.x - last.x, point.y - last.y) < 4
              ? last.count + 1
              : 1;
          lastDown.current = {
            time: now,
            x: point.x,
            y: point.y,
            count: clicks,
          };
          pressed.current = clicks < 2;
          const act = () => {
            if (clicks >= 3) selection.selectLineAt(page.ref, point);
            else if (clicks === 2) {
              selection.selectWordAt(page.ref, point);
            } else {
              selection.clear();
              selection.beginGestureAt(page.ref, point);
            }
          };
          if (selection.isLoaded(page.ref)) act();
          else void selection.ensureLoaded(page.ref).then(act);
        },
        onPointerMove: (event: PointerEvent) => {
          if (!pressed.current) return;
          selection.extendTo(page.ref, at(event));
        },
        onPointerUp: () => {
          if (!pressed.current) return;
          pressed.current = false;
          selection.endGesture();
        },
      }
    : {};

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
      {...responder}
      style={{ width, height, backgroundColor: background, overflow: 'hidden' }}
    >
      {base !== null ? (
        <PdfTile
          tileId={base}
          style={{ position: 'absolute', left: 0, top: 0, width, height }}
        />
      ) : null}
      {hits.map((hit, index) =>
        hit.segments.map((segment, part) => (
          <View
            key={`${index}:${part}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: segment.rect.x * zoom,
              top: segment.rect.y * zoom,
              width: segment.rect.width * zoom,
              height: segment.rect.height * zoom,
              backgroundColor:
                hit === activeHit
                  ? 'rgba(255, 140, 0, 0.5)'
                  : 'rgba(255, 214, 0, 0.4)',
              zIndex: 1000,
            }}
          />
        )),
      )}
      {selectionRects.map((rect, index) => (
        <View
          key={`selection:${index}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: rect.x * zoom,
            top: rect.y * zoom,
            width: rect.width * zoom,
            height: rect.height * zoom,
            backgroundColor: 'rgba(37, 99, 235, 0.3)',
            zIndex: 1001,
          }}
        />
      ))}
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
