import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PageInfo } from '@embedpdf/core';
import { PageView } from './PageView';
import { createPdfSession, type PdfSession } from './session';
import {
  clampZoom,
  fitZoom,
  layoutPages,
  pageAt,
  visibleRange,
} from './layout';

export type PdfSource =
  { path: string; bytes?: undefined } | { bytes: Uint8Array; path?: undefined };

export type PdfFit = 'width' | 'page' | number;

export interface PdfViewerState {
  status: 'loading' | 'locked' | 'ready' | 'error';
  pageCount: number;
  page: number;
  zoom: number;
  fit: PdfFit;
  passwordIncorrect: boolean;
  error?: string;
}

export interface PdfViewerController {
  zoomIn(): void;
  zoomOut(): void;
  setZoom(zoom: number): void;
  fitWidth(): void;
  fitPage(): void;
  goToPage(page: number): void;
  unlock(password: string): Promise<void>;
  download(): Promise<Uint8Array>;
  getState(): PdfViewerState;
}

export interface PdfViewerProps {
  source: PdfSource;
  password?: string;
  fit?: PdfFit;
  controllerRef?: Ref<PdfViewerController>;
  onStateChange?(state: PdfViewerState): void;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  pageBackground?: string;
}

const ZOOM_STEP = 1.25;
const EMPTY: readonly PageInfo[] = [];

export function PdfViewer({
  source,
  password,
  fit: initialFit = 'width',
  controllerRef,
  onStateChange,
  style,
  backgroundColor = '#52525b',
  pageBackground,
}: PdfViewerProps) {
  const [session] = useState<PdfSession>(createPdfSession);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [status, setStatus] = useState<PdfViewerState['status']>('loading');
  const [error, setError] = useState<string>();
  const [incorrect, setIncorrect] = useState(false);
  const [pages, setPages] = useState<readonly PageInfo[]>(EMPTY);
  const [fit, setFit] = useState<PdfFit>(initialFit);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [offset, setOffset] = useState(0);
  const scroller = useRef<ScrollViewInstance>(null);
  const latest = useRef({ zoom, offset, viewport });
  latest.current = { zoom, offset, viewport };

  const sizes = useMemo(() => pages.map(page => page.size), [pages]);
  const layout = useMemo(() => layoutPages(sizes, zoom), [sizes, zoom]);

  const load = useCallback(
    async (id: string) => {
      const info = session.kernel.documents.get(id);
      if (!info) return;
      if (info.status === 'locked') {
        setIncorrect(Boolean(info.passwordProvided));
        setStatus('locked');
        return;
      }
      if (info.status === 'error') {
        setError(info.error?.message ?? 'The document could not be opened');
        setStatus('error');
        return;
      }
      setPages(session.kernel.documents.listPages(id));
      setStatus('ready');
    },
    [session],
  );

  useEffect(() => {
    let cancelled = false;
    let opened: string | null = null;
    setStatus('loading');
    setPages(EMPTY);
    (async () => {
      await session.ready;
      const input =
        source.path !== undefined
          ? { kind: 'layerFile' as const, basePath: source.path }
          : { kind: 'bytes' as const, bytes: source.bytes };
      const result = await session.kernel.documents.open(input, {
        password,
        scope: ['*'],
      });
      const id = result.document.id;
      opened = id;
      if (cancelled) return;
      setDocumentId(id);
      await load(id);
    })().catch(reason => {
      if (cancelled) return;
      setError(String(reason?.message ?? reason));
      setStatus('error');
    });
    return () => {
      cancelled = true;
      if (opened) void session.kernel.documents.close(opened).catch(() => {});
    };
  }, [session, source.path, source.bytes, password, load]);

  useEffect(() => {
    if (typeof fit === 'number') {
      setZoom(clampZoom(fit));
      return;
    }
    setZoom(current => clampZoom(fitZoom(sizes, viewport, fit, current)));
  }, [fit, sizes, viewport]);

  const current = pageAt(layout.boxes, offset + viewport.height / 2);
  const state: PdfViewerState = {
    status,
    pageCount: pages.length,
    page: current + 1,
    zoom,
    fit,
    passwordIncorrect: incorrect,
    error,
  };
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    onStateChange?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields are the identity
  }, [
    status,
    pages.length,
    current,
    zoom,
    fit,
    incorrect,
    error,
    onStateChange,
  ]);

  const changeZoom = useCallback((next: number) => {
    const { zoom: before, offset: top, viewport: box } = latest.current;
    const target = clampZoom(next);
    const middle = top + box.height / 2;
    setFit(target);
    scroller.current?.scrollTo({
      y: Math.max(0, (middle * target) / before - box.height / 2),
      animated: false,
    });
  }, []);

  const controller = useMemo<PdfViewerController>(
    () => ({
      zoomIn: () => changeZoom(latest.current.zoom * ZOOM_STEP),
      zoomOut: () => changeZoom(latest.current.zoom / ZOOM_STEP),
      setZoom: changeZoom,
      fitWidth: () => setFit('width'),
      fitPage: () => setFit('page'),
      goToPage: page => {
        const box = layout.boxes[Math.min(layout.boxes.length, page) - 1];
        if (box) {
          scroller.current?.scrollTo({ y: box.top - 8, animated: false });
        }
      },
      unlock: async password => {
        if (!documentId) return;
        try {
          await session.kernel.documents.unlock(documentId, { password });
        } catch {
          setIncorrect(true);
          return;
        }
        await load(documentId);
      },
      download: () =>
        session.kernel.documents.download(documentId ?? undefined),
      getState: () => stateRef.current,
    }),
    [changeZoom, layout, documentId, session, load],
  );
  useImperativeHandle(controllerRef, () => controller, [controller]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setOffset(event.nativeEvent.contentOffset.y);
    },
    [],
  );
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport(previous =>
      previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  const range = visibleRange(
    layout.boxes,
    offset,
    viewport.height,
    viewport.height / 2,
  );

  return (
    <View style={[{ flex: 1, backgroundColor }, style]} onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        testID="pdf-viewer-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={{ height: layout.height, width: viewport.width }}>
          {documentId && status === 'ready'
            ? pages.slice(range.first, range.last + 1).map((page, i) => {
                const index = range.first + i;
                const box = layout.boxes[index];
                return (
                  <View
                    key={String(index)}
                    testID={`pdf-page-${index + 1}`}
                    style={{
                      position: 'absolute',
                      top: box.top,
                      left: Math.max(0, (viewport.width - box.width) / 2),
                    }}
                  >
                    <PageView
                      kernel={session.kernel}
                      documentId={documentId}
                      page={page}
                      zoom={zoom}
                      background={pageBackground}
                      visible={{
                        top: offset - box.top,
                        bottom: offset + viewport.height - box.top,
                      }}
                    />
                  </View>
                );
              })
            : null}
        </View>
      </ScrollView>
    </View>
  );
}
