# Loom pin

The [Loom](https://github.com/ammarahm-ed/Loom) renderer is not on npm, so we pin it by commit, as gpui-fast is, and bump it on purpose. `loom-pin.json` is what the build reads; this file says what it names.

## Pinned

- Repository: https://github.com/ammarahm-ed/Loom
- Branch: `0.87-stable`
- Commit: `f92e729282dcdced89504529f73518cb1d1fea38`, `packages/react-native-loom` 0.87.0, for React Native 0.87.1
- Archive: `https://codeload.github.com/ammarahm-ed/Loom/tar.gz/<commit>`, SHA-256 `d6c143496c6b22e9848dcf84d0012c934762891141f186c91dc2e04af696b70e`

## How it is used

`renderer.js` downloads the archive into the native-dependency cache (`native-deps/loom`), checks the digest, and runs the package's own `bin/loom.js materialize` against the app's `react-native`. The result, under `native-deps/loom/trees`, is what Metro, autolink, the codegen and the C++ build read when `desktop/desktop.json` selects `"renderer": "loom"`.

## Moving the pin

1. Change `commit`, `version` and `archiveUrl` in `loom-pin.json`, and put the SHA-256 of the archive in `sha256`.
2. Run `npm run check:loom-overrides` in `packages/core`. It fails for every Loom variant in `ReactCommonOverrides.loom` whose source file changed; carry the change over and update `loomBaseHash` in `overrides.json`.
3. Update this file.
