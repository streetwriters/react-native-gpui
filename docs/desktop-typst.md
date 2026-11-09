---
id: desktop-typst
title: Typst
---

`@react-native-gpui/typst` compiles [Typst](https://typst.app) to PDF with the Typst 0.15.1 compiler linked into the app, and prints the result. It never uses the network.

```shell
npm install @react-native-gpui/typst
```

```js
import { compile, print } from '@react-native-gpui/typst';

const { pdf, pages, diagnostics } = await compile(source, {
  files: { 'img-0.png': pngBytes },
  fonts: [interBytes],
  title: 'My note',
  output: 'bytes',
});

await print(path, { title: 'My note', copies: 1 });
```

## Options

- `files`: the only files the document can read, by name (`ArrayBuffer`, `Uint8Array` or `{ path }`). Names are letters, digits, `.`, `_` and `-`, up to 64 characters, with at most 2,000 files and 256 MB per compile. Reuse the same names from one compile to the next (`img-0.png`, `img-1.png`, ...): Typst keeps every file name it has seen for the life of the process, so the module refuses new names after 20,000 distinct ones.
- `fonts`: font files the app ships, as bytes or `{ path }`.
- `systemFonts`: `'auto'` (default), `'always'` or `'never'`. The bundled fonts (New Computer Modern Math and DejaVu Sans Mono) and your `fonts` are always available. With `'auto'` the system fonts are scanned, once per process, only when the source names a font family or uses a character that none of those fonts has.
- `inputs`: values for `sys.inputs`. `title` and `author` set the document metadata. `pdfA` asks for PDF/A-2b.
- `output`: `'bytes'` (default, `result.pdf`) or `{ path }` to write the file natively.
- `timeoutMs` (default 60,000) and `signal`: a compile past the timeout rejects with `ERR_TYPST_TIMEOUT`, an aborted one with `ERR_TYPST_ABORTED`. Typst cannot be interrupted in the middle of laying out a page, so the work may run on in the background; the result is discarded.

A compile that fails rejects with a `TypstError` whose `diagnostics` list the severity, message, file, line, column and hints.

## What a document can read

Only the `files` map. `#read("/etc/passwd")`, `#image("/...")`, `#include` of any other file and `@preview/...` packages fail with "access denied", and a path that climbs above the project root fails too.

## Printing

`print(pdfPath, options)` shows the system print panel and resolves with `printed` or `cancelled`. It is implemented on macOS (PDFKit). Other platforms reject with `ERR_TYPST`.

## Binary size

The compiler adds about 24 to 28 MB to the app. Building the Typst crates for size keeps it at the low end; add this to the app's `desktop/Cargo.toml`:

```toml
[profile.release.package.typst]
opt-level = "s"
[profile.release.package.typst-layout]
opt-level = "s"
[profile.release.package.typst-library]
opt-level = "s"
[profile.release.package.typst-eval]
opt-level = "s"
[profile.release.package.typst-realize]
opt-level = "s"
[profile.release.package.typst-syntax]
opt-level = "s"
[profile.release.package.typst-pdf]
opt-level = "s"
```

A profile in a library's own `Cargo.toml` does not apply when the app builds it, so this has to be in the app.
