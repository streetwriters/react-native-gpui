# Changelog

All notable changes to `@react-native-gpui/svg` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- An SVG is drawn with the same antialiasing as Chrome: once per coverage sample at the window's scale, without antialiasing, with the four sample positions Chrome uses, and averaged. An icon's edge now takes the same five coverage steps (0, 1/4, 1/2, 3/4, 1) at the same pixels, so the Material star at 16 points differs from Chrome in 5 of 1024 pixels instead of 112, and over 80 icons in 124,480 pixels in 1,288 instead of 7,250. Needs `image` and `smallvec` in the crate.
- Asks core for each node's subtree, which core now hands a component renderer only when it reads it.

## 15.15.0-alpha.0 - 2026-11-01

- First release, for `react-native-svg` 15.15.x.
- Renders SVG elements with the desktop renderer.
