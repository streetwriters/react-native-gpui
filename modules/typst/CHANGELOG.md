# Changelog

All notable changes to `@react-native-gpui/typst` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version: `compile(source, options)` turns Typst source into a PDF (bytes or a file), on the Typst 0.15.1 compiler, with no network access.
- Files come only from the `files` map; reading any other path, including `@preview` packages, is refused.
- Fonts: a small bundled set (New Computer Modern Math and DejaVu Sans Mono), the fonts the app passes, and the system fonts, which are scanned only when the source asks for a family or a character none of the others has.
- Diagnostics with file, line and column; a timeout, an `AbortSignal`, and limits on source size, file count and file bytes.
- `print(pdfPath)` opens the macOS print panel through PDFKit. It has not been exercised against a printer.
- A font given as `{ path }` may be an app asset, `file://assets/fonts/Inter-Regular.ttf`, which is read from the app's assets directory like an image is. A path that climbs out of it is refused.
- `systemFonts: 'fallback'` scans the system fonts only when a character is missing from the bundled and given fonts; unavailable family names in the font list are skipped instead of triggering the scan.
