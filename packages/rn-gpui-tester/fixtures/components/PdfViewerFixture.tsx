import '@react-native-gpui/crypto';
import { ENCRYPTED_PDF_BASE64 } from './pdfEncryptedBytes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  PdfViewer,
  type PdfViewerController,
  type PdfViewerState,
} from '@react-native-gpui/pdf';

function buildPdf(pageCount: number): Uint8Array {
  const objects: string[] = [];
  const kids: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let page = 0; page < pageCount; page++) {
    const pageObject = objects.length + 1;
    kids.push(`${pageObject} 0 R`);
    const content = `BT /F1 48 Tf 240 560 Td (Page ${page + 1}) Tj ET 0.2 0.4 0.9 rg 72 400 ${100 + (page % 5) * 60} 120 re f`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageObject + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`;
  let text = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(text, character => character.charCodeAt(0));
}

function Button({ id, onPress }: { id: string; onPress(): void }) {
  return (
    <Pressable
      testID={id}
      onPress={onPress}
      style={{ padding: 6, backgroundColor: '#1e293b', borderRadius: 4 }}
    >
      <Text style={{ color: '#fff' }}>{id}</Text>
    </Pressable>
  );
}

export default function PdfViewerFixture({
  pages = 3,
  budget,
  encrypted,
}: {
  pages?: number;
  budget?: number;
  encrypted?: boolean;
}) {
  const bytes = useMemo(
    () =>
      encrypted
        ? Uint8Array.from(globalThis.atob(ENCRYPTED_PDF_BASE64), c =>
            c.charCodeAt(0),
          )
        : buildPdf(pages),
    [pages, encrypted],
  );
  const controller = useRef<PdfViewerController>(null);
  const [state, setState] = useState<PdfViewerState | null>(null);
  const [stats, setStats] = useState('');
  const [selected, setSelected] = useState('');
  const [frames, setFrames] = useState('');
  const gaps = useRef<number[]>([]);
  const measuring = useRef(false);
  const startFrames = () => {
    gaps.current = [];
    measuring.current = true;
    let last = Date.now();
    const tick = () => {
      if (!measuring.current) return;
      const now = Date.now();
      gaps.current.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const stopFrames = () => {
    measuring.current = false;
    const sorted = [...gaps.current].sort((a, b) => a - b);
    const at = (q: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    setFrames(
      sorted.length === 0
        ? 'none'
        : `n ${sorted.length} median ${at(0.5)} p95 ${at(0.95)} p99 ${at(0.99)} max ${sorted[sorted.length - 1]}`,
    );
  };
  useEffect(() => {
    if (budget) {
      const {
        NativePdfTiles,
      } = require('@react-native-gpui/pdf/src/native-tiles');
      NativePdfTiles.setBudget(budget);
    }
  }, [budget]);
  useEffect(() => {
    const timer = setInterval(() => {
      const {
        NativePdfTiles,
      } = require('@react-native-gpui/pdf/src/native-tiles');
      const s = NativePdfTiles.stats();
      setStats(`tiles ${s.tiles} bytes ${s.bytes} evicted ${s.evicted}`);
    }, 300);
    return () => clearInterval(timer);
  }, []);
  return (
    <View testID="pdf-viewer-fixture" style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 6, padding: 6 }}>
        <Button id="zoom-in" onPress={() => controller.current?.zoomIn()} />
        <Button id="zoom-out" onPress={() => controller.current?.zoomOut()} />
        <Button id="fit-width" onPress={() => controller.current?.fitWidth()} />
        <Button id="fit-page" onPress={() => controller.current?.fitPage()} />
        <Button
          id="unlock-wrong"
          onPress={() => void controller.current?.unlock('lion')}
        />
        <Button
          id="unlock"
          onPress={() => void controller.current?.unlock('1234')}
        />
        <Button
          id="search-page-2"
          onPress={() => void controller.current?.search('Page 2')}
        />
        <Button id="next-hit" onPress={() => controller.current?.nextHit()} />
        <Button
          id="read-selection"
          onPress={() =>
            void controller.current?.getSelectedText().then(setSelected)
          }
        />
        <Text testID="pdf-selected">{selected}</Text>
        <Button id="start-frames" onPress={startFrames} />
        <Button id="stop-frames" onPress={stopFrames} />
        <Text testID="pdf-frames">{frames}</Text>
        <Button id="page-3" onPress={() => controller.current?.goToPage(3)} />
        <Text testID="pdf-state">
          {state
            ? `${state.status} page ${state.page}/${state.pageCount} zoom ${state.zoom.toFixed(2)} hits ${state.search.hits} ${state.search.status} active ${state.search.active} on ${state.search.activePage}${state.error ? ` ${state.error}` : ''}`
            : 'none'}
        </Text>
        <Text testID="pdf-stats">{stats}</Text>
      </View>
      <PdfViewer
        source={{ bytes }}
        controllerRef={controller}
        onStateChange={setState}
      />
    </View>
  );
}
