---
id: desktop-pdf
title: PDF
---

`@react-native-gpui/pdf` runs EmbedPDF's engine on EmbedPDF's native PDFium runtime. The runtime is a Node-API addon, which desktop apps load unchanged (see [Native Modules: Node addons](native-modules-node-addons)).

```shell
npm install @react-native-gpui/pdf
```

Wrap the Metro config so that `@embedpdf/engine` uses the native runtime instead of WebAssembly:

```js title="metro.config.js"
const withPdfRuntime = require('@react-native-gpui/pdf/metro.cjs');

module.exports = withPdfRuntime(config);
```

```js
import { createPdfEngine } from '@react-native-gpui/pdf';

const engine = createPdfEngine();
const doc = await engine.open(
  { kind: 'layerFile', basePath: '/path/to/file.pdf' },
  { scope: ['*'] },
);
```

`layerFile` lets PDFium read the file from disk, so the bytes never enter JavaScript. A password goes in the options (`password`), or later with `doc.security.unlock({ password })`.

The engine needs `crypto.getRandomValues`, `AbortController` and `queueMicrotask` globals, as well as `Blob`, `URL.createObjectURL` and a PNG encoder (`imageEncoder`) when you ask it for page images.
