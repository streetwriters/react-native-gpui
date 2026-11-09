import '@react-native-gpui/crypto';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { createPdfEngine, nativeTiles, tileIdOf } from '@react-native-gpui/pdf';
import {
  NativePdfTiles,
  PdfTile,
} from '@react-native-gpui/pdf/src/native-tiles';
import { TILE_PDF_BASE64 } from './pdfFixtureBytes';

function bytesOf(base64: string): Uint8Array {
  const text = globalThis.atob(base64);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}

export default function PdfTileFixture() {
  const [tile, setTile] = useState<{
    id: number;
    width: number;
    height: number;
  } | null>(null);
  const [status, setStatus] = useState('opening');
  const [stats, setStats] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const engine = createPdfEngine({ tiles: nativeTiles() });
      const doc = await engine.open(
        { kind: 'bytes', bytes: bytesOf(TILE_PDF_BASE64) },
        { scope: ['*'] },
      );
      const list = await doc.pages.list();
      const image = await doc.page(list.pages[0].ref).render.image({
        viewport: { kind: 'scale', scale: 2 },
      });
      const id =
        image.source.kind === 'bytes' ? tileIdOf(image.source.bytes) : null;
      if (cancelled || id === null) return;
      setTile({ id, width: image.width, height: image.height });
      const s = NativePdfTiles.stats();
      setStats(`tiles ${s.tiles} bytes ${s.bytes}`);
      setStatus(`pages ${list.pageCount}`);
    })().catch(error => setStatus(`error ${String(error?.message ?? error)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View
      testID="pdf-tile-fixture"
      style={{ flex: 1, padding: 24, gap: 12, backgroundColor: '#e2e8f0' }}
    >
      <Text testID="pdf-tile-status">{status}</Text>
      <Text testID="pdf-tile-info">
        {tile ? `tile ${tile.id} ${tile.width}x${tile.height}` : 'no tile'}
      </Text>
      <Text testID="pdf-tile-stats">{stats}</Text>
      {tile ? (
        <PdfTile
          testID="pdf-tile"
          tileId={tile.id}
          style={{ width: tile.width / 2, height: tile.height / 2 }}
        />
      ) : null}
    </View>
  );
}
