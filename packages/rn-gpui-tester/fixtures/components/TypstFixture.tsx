import '@react-native-gpui/crypto';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { compile, print, TypstError } from '@react-native-gpui/typst';
import { PdfViewer, createPdfEngine } from '@react-native-gpui/pdf';

const SOURCE = `#set page(paper: "a4", margin: 2cm)
#set text(font: "DejaVu Sans Mono", size: 11pt)
= Typst note
Some *bold* text, a list and math $x^2 + y^2 = z^2$.
- one
- two
#table(columns: 2, [A], [B], [1], [2])
`;

export default function TypstFixture() {
  const [status, setStatus] = useState('compiling');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [errors, setErrors] = useState('');
  const [viewer, setViewer] = useState('');
  const [printed, setPrinted] = useState('');

  useEffect(() => {
    (async () => {
      const result = await compile(SOURCE, { title: 'Fixture' });
      setBytes(new Uint8Array(result.pdf!));
      setStatus(`compiled ${result.pages} pages`);
      const bad = await compile('= A\n#read("/etc/hosts")').then(
        () => 'no error',
        error =>
          error instanceof TypstError
            ? `${error.code} ${error.diagnostics[0]?.line} ${error.diagnostics[0]?.message}`
            : String(error),
      );
      const broken = await compile('= A\n#undefined()').then(
        () => 'no error',
        error =>
          error instanceof TypstError
            ? `${error.code} ${error.diagnostics[0]?.line} ${error.diagnostics[0]?.message}`
            : String(error),
      );
      setErrors(`${bad} | ${broken}`);
      const three = await compile(
        '#set page(width: 100pt, height: 100pt)\nOne\n#pagebreak()\nTwo\n#pagebreak()\nThree',
        { output: { path: '/tmp/rn-gpui-typst-three.pdf' } },
      );
      const printResult = await print('/tmp/rn-gpui-typst-three.pdf', {
        panel: false,
        pageRange: '2-3',
        outputPath: '/tmp/rn-gpui-typst-printed.pdf',
      });
      const engine = createPdfEngine({ fallbackFonts: false });
      const doc = await engine.open({
        kind: 'layerFile',
        basePath: '/tmp/rn-gpui-typst-printed.pdf',
      });
      const list = await doc.pages.list();
      const invalid = await print('/tmp/rn-gpui-typst-three.pdf', {
        panel: false,
        pageRange: '9',
        outputPath: '/tmp/rn-gpui-typst-never.pdf',
      }).then(
        () => 'no error',
        error => String(error?.code ?? error),
      );
      setPrinted(
        `${three.pages} ${printResult.status} ${list.pageCount} ${invalid}`,
      );
    })().catch(error => setStatus(`error ${String(error?.message ?? error)}`));
  }, []);

  return (
    <View testID="typst-fixture" style={{ flex: 1 }}>
      <Text testID="typst-status">{status}</Text>
      <Text testID="typst-errors">{errors}</Text>
      <Text testID="typst-viewer">{viewer}</Text>
      <Text testID="typst-printed">{printed}</Text>
      {bytes ? (
        <PdfViewer
          source={{ bytes }}
          onStateChange={state =>
            setViewer(`${state.status} ${state.error ?? ''}`)
          }
        />
      ) : null}
    </View>
  );
}
