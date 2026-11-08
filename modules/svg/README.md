# @react-native-gpui/svg

Desktop support for [`react-native-svg`](https://github.com/software-mansion/react-native-svg): SVG elements drawn by the desktop renderer.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

Install it next to `react-native-svg`:

```sh
npm install react-native-svg@15.15.x @react-native-gpui/svg
```

Keep using `react-native-svg` as you do on iOS and Android; its JavaScript API is unchanged. Autolinking builds the desktop side when the app is built.

## What is drawn

Shapes, paths, text, gradients, masks, clip paths, symbols, patterns and markers, with the transform of each element (react-native-svg sends it as a six number matrix). Filters are drawn too: `filter` on a shape or group and the `feBlend`, `feColorMatrix`, `feComposite`, `feFlood`, `feGaussianBlur`, `feMerge` and `feOffset` primitives, always with sRGB colour interpolation. An icon is drawn with the same antialiasing as Chrome and placed at a whole CSS pixel, as Chrome places an inline SVG.

Limits: `overflow="visible"` is not honoured (the drawing is clipped to the SVG's frame), the other filter primitives such as `feDropShadow` and `feMorphology` are not passed to the renderer, and a blurred shadow comes out about one level lighter than Chrome's for each shadow that overlaps another.

## Documentation

[Supported libraries](https://streetwriters.github.io/react-native-gpui/docs/supported-libraries)

## License

MIT. See [LICENSE](LICENSE).
