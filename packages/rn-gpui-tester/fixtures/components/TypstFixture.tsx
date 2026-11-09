import '@react-native-gpui/crypto';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { compile, TypstError } from '@react-native-gpui/typst';
import { PdfViewer } from '@react-native-gpui/pdf';

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
    })().catch(error => setStatus(`error ${String(error?.message ?? error)}`));
  }, []);

  return (
    <View testID="typst-fixture" style={{ flex: 1 }}>
      <Text testID="typst-status">{status}</Text>
      <Text testID="typst-errors">{errors}</Text>
      <Text testID="typst-viewer">{viewer}</Text>
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
