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

## License

MIT. See [LICENSE](LICENSE). The bundled fonts keep their own licences, see `desktop/fonts/LICENSES.md`.
