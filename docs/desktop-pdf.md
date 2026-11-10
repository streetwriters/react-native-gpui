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

## Packaging

The CLI collects the runtime addon and its `libembedpdf` library into `Resources/node-addons` when it packages or runs a release build; see Packaging in [Native Modules: Node addons](native-modules-node-addons).

Signing the collected addon and library is a pending decision. The CLI can sign them with the app's identity when `APPLE_SIGNING_IDENTITY` is set, or the app can carry the `com.apple.security.cs.disable-library-validation` entitlement in `bundle.macos.entitlements` instead.

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

## Random bytes

The engine names documents with random ids from `crypto.getRandomValues`, which it reads from the global. This module never installs or replaces anything on `crypto`: the app installs a secure implementation at startup, for example `import '@react-native-gpui/crypto'`, and `createPdfEngine` throws if there is none.

## Viewer

```js
import { PdfViewer } from '@react-native-gpui/pdf';

<PdfViewer source={{ path }} controllerRef={ref} onStateChange={setState} />;
```

`controllerRef` gives `zoomIn`, `zoomOut`, `setZoom`, `fitWidth`, `fitPage`, `goToPage`, `getOutline`, `goToOutlineItem`, `unlock`, `search`, `nextHit`, `previousHit`, `clearSearch`, `getSelectedText`, `clearSelection` and `download`. `onStateChange` reports the status (`loading`, `locked`, `ready`, `error`), page, page count, zoom and the search state. Drag selects text, a double-click selects a word and a triple-click a line.

`pageGap` (default 12), `padding` (default 16) and `pageShadow` (default false, draws `0 2px 6px rgba(0, 0, 0, 0.2)`) shape the page column. The current page is the one with the largest visible area, the first on a tie.
