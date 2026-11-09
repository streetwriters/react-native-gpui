# Changelog

All notable changes to `@react-native-gpui/pdf` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version, a spike: runs EmbedPDF's own engine (`@embedpdf/engine`, unchanged) on EmbedPDF's native PDFium runtime, loaded as the Node-API addon that `@embedpdf/engine-runtime-<platform>` ships. No WebAssembly and no Web Worker.
