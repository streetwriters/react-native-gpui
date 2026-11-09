# @react-native-gpui/pdf

EmbedPDF's PDF engine for React Native GPUI apps. It runs [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer)'s own `@embedpdf/engine`, unchanged, on EmbedPDF's native PDFium runtime, so documents open, render, search, select text and take annotations without WebAssembly or a webview.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/pdf
```

Add the Metro helper so `@embedpdf/engine` finds the native runtime instead of its WebAssembly one:

```js title="metro.config.js"
const withPdfRuntime = require('@react-native-gpui/pdf/metro.cjs');

module.exports = withPdfRuntime(config);
```

## Random bytes

The engine names documents with random ids from `crypto.getRandomValues`, which it reads from the global. This module never installs or replaces anything on `crypto`; the app must install a secure implementation at startup (for example `import '@react-native-gpui/crypto'`). `createPdfEngine` throws if there is none.

## Usage

```js
import { createPdfEngine } from '@react-native-gpui/pdf';

const engine = createPdfEngine();
const doc = await engine.open(
  { kind: 'layerFile', basePath: '/path/to/file.pdf' },
  { scope: ['*'], password: '1234' },
);
const { pageCount } = await doc.pages.list();
```

## License

MIT. See [LICENSE](LICENSE). The runtime binaries are EmbedPDF's: Apache-2.0 for the additions, BSD-3-Clause for PDFium, with the third-party notices that ship in `@embedpdf/engine-runtime-<platform>`.
