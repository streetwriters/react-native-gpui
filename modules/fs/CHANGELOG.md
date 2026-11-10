# Changelog

All notable changes to `@react-native-gpui/fs` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- Add `upload(url, path, options)`, which streams a file, or a range of one, as an HTTP request body in small blocks, reports progress, honours an `AbortSignal` and resolves with the response status, headers and the start of its body.
- Add `download(url, path, options)`, which streams an HTTP response to a file through `<path>.part`, reports progress, honours an `AbortSignal` and rejects on a non-2xx status.

## 0.0.1-alpha.0 - 2026-11-01

- First release.
- File system access for desktop apps.
