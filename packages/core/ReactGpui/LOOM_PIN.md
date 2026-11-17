# Loom pin

The [Loom](https://github.com/ammarahm-ed/Loom) renderer is not on npm, so we pin it by commit, as gpui-fast is, and bump it on purpose. `loom-pin.json` is what the build reads; this file says what it names.

## Pinned

- Repository: https://github.com/ammarahm-ed/Loom
- Branch: `feat/runtime-js-thread-0.87`
- Commit: `4ca8d49435e9aec510dc5c7546656f988d7b870a`, `packages/react-native-loom` 0.87.0, for React Native 0.87.1
- Archive: `https://codeload.github.com/ammarahm-ed/Loom/tar.gz/<commit>`, SHA-256 `3637447cd65d47f1ec819659cd6f4d2d489a37fb0bcea70b7b2a605648c0eff5`

## How it is used

`renderer.js` downloads the archive into the native-dependency cache (`native-deps/loom`), checks the digest, and runs the package's own `bin/loom.js materialize` against the app's `react-native`. The result, under `native-deps/loom/trees`, is what Metro, autolink, the codegen and the C++ build read when `desktop/desktop.json` selects `"renderer": "loom"`.

## Moving the pin

1. Change `commit`, `version` and `archiveUrl` in `loom-pin.json`, and put the SHA-256 of the archive in `sha256`.
2. Run `npm run check:loom-overrides` in `packages/core`. It fails for every Loom variant in `ReactCommonOverrides.loom` whose source file changed; carry the change over and update `loomBaseHash` in `overrides.json`.
3. Update this file.
