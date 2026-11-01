<p align="center">
  <img src="website/static/img/header_logo.svg" alt="React Native logo" width="112" height="102" />
</p>

<h1 align="center">React Native GPUI</h1>

<p align="center">
  React Native for <b>macOS, Windows and Linux</b>, rendered with <a href="https://github.com/zed-industries/zed/tree/main/crates/gpui">GPUI</a>.
</p>

<p align="center">
  Write your app once in React and ship it as a native desktop executable. One GPU-accelerated renderer draws it on every platform, so it looks and behaves the same everywhere, and your existing React Native components, libraries and knowledge carry over.
</p>

<p align="center">
  <a href="https://streetwriters.github.io/react-native-gpui/">Documentation</a> · <a href="https://streetwriters.github.io/react-native-gpui/docs/getting-started">Getting started</a>
</p>

## Get started

```sh
npx @react-native-gpui/cli init MyApp
cd MyApp
npx react-native run-desktop
```

To add desktop to an existing React Native app, run `npx react-native init-desktop` in it. See [Getting started](https://streetwriters.github.io/react-native-gpui/docs/getting-started) for the tools each operating system needs.

## What you get

- The React Native components and APIs you know, drawn on the GPU.
- Desktop features: multiple windows, menus, a tray icon, keyboard shortcuts and deep links.
- Native modules in Rust or C++, native views, and Node-API addons.
- Popular libraries such as Reanimated, Gesture Handler, Screens and SVG.
- Installers for every platform: `.dmg`, an NSIS installer, `.deb` and `.AppImage`.

## Status

Alpha. It targets React Native 0.87. Expect rough edges, and please [report issues](https://github.com/streetwriters/react-native-gpui/issues).

## License

The code is [MIT](LICENSE). The documentation is [CC BY 4.0](LICENSE-docs), adapted from the React Native documentation.
