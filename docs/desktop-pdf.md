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

## Packaging

The release bundle names the runtime addon, so `react-native-gpui collect-node-addons --bundle <bundle> --out <dir>` copies `pdf-runtime.node` and the `libembedpdf` library next to it into `<dir>/node_modules/@embedpdf/engine-runtime-<platform>/lib/`. Ship `<dir>` as `node-addons` beside the executable (`Resources/node-addons` in a macOS app). A signed macOS app has to re-sign both files with the app's identity or carry the `com.apple.security.cs.disable-library-validation` entitlement in `bundle.macos.entitlements`.

`THIRD_PARTY_NOTICES.md` lists the licences of the components in the runtime; include it in the app's own notices.

## Native tiles

```js
const engine = createPdfEngine({ tiles: sink });
const image = await doc
  .page(ref)
  .render.image({ viewport: { kind: 'scale', scale: 2 } });
const id = tileIdOf(image.source.bytes);
```

`sink.adopt(pointer, width, height, stride)` is called once per rendered bitmap with the address of its pixels and returns a tile id; it must copy the pixels before it returns. With a sink, `render.raw()` returns the token as well, so use `image()`.
