# @react-native-gpui/typst

Compiles [Typst](https://typst.app) to PDF and prints PDFs from React Native GPUI apps, with no webview and no network.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/typst
```

## Usage

```js
import { compile, print } from '@react-native-gpui/typst';

const { pdf, pages } = await compile('= Hello\nSome *Typst*.', {
  files: { 'img-0.png': pngBytes },
  fonts: [interBytes],
  title: 'My note',
});
```

See the [documentation](https://streetwriters.github.io/react-native-gpui/docs/desktop-typst) for the options, the limits, the font rules and the build setting that keeps the binary small.

## Binary size

The compiler adds about 24 to 28 MB to the app. Building the Typst crates for size keeps it at the low end. A profile in a library's own `Cargo.toml` does not apply when an app builds it, so add this to the app's `desktop/Cargo.toml`:

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

## License

MIT. See [LICENSE](LICENSE). The bundled fonts keep their own licences, see `desktop/fonts/LICENSES.md`.
