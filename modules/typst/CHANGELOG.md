# Changelog

All notable changes to `@react-native-gpui/typst` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version: `compile(source, options)` turns Typst source into a PDF (bytes or a file), on the Typst 0.15.1 compiler, with no network access.
- Files come only from the `files` map; reading any other path, including `@preview` packages, is refused.
- Fonts: a small bundled set (New Computer Modern Math and DejaVu Sans Mono), the fonts the app passes, and the system fonts, which are scanned only when the source asks for a family or a character none of the others has.
- Diagnostics with file, line and column; a timeout, an `AbortSignal`, and limits on source size, file count and file bytes.
- `print(pdfPath)` opens the macOS print panel through PDFKit. It has not been exercised against a printer.
