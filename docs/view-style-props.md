---
id: view-style-props
title: View Style Props
---

All upstream props work as documented in the [React Native View Style Props reference](https://reactnative.dev/docs/0.87/view-style-props). This page lists only what desktop adds or changes.

## Desktop props

| Name     | Type     | Behaviour                                                                                                     |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `cursor` | `string` | The cursor shown over the view, with the names CSS uses (`pointer`, `text`, `grab`, `not-allowed` and so on). |

## Differences

- `experimental_backgroundImage` (and `backgroundImage`) draws `linear-gradient()` and `radial-gradient()` layers, with `experimental_backgroundSize`, `experimental_backgroundPosition` and `experimental_backgroundRepeat`, and follows the view's `borderRadius`. Desktop also reads `repeating-linear-gradient()` and `repeating-radial-gradient()`, which React Native does not: the stops from the first to the last are one period, repeated along the line or out from the centre as CSS does, so `repeating-linear-gradient(-45deg, transparent, transparent 20px, #ccc 20px, #ccc 21px)` draws diagonal hatching. A repeating layer can sit among plain ones in the same value. This is a desktop extension beyond React Native's parser, and it works through a marker: the view config parses a repeating layer as the plain gradient and puts a color stop at position `-100000000` in front of its stops, and the renderer removes that stop and repeats the rest. Only the desktop view config produces it. A gradient that is handed to the native side already parsed, without going through the view config, has to include that stop itself to repeat.
- `cursor` sets the mouse cursor over the view.
- `filter` applies every function in the order listed. `blur` and `dropShadow` paint the view and its descendants into a picture of their own and work on that picture. The colour functions colour each drawn shape, image and glyph.
- `mixBlendMode` blends the view and its descendants, painted into a picture of their own, with the nearest ancestor that is a stacking context (an `isolation: 'isolate'` view, a view with a `filter`, an `opacity` below 1 with children, or a `mixBlendMode` of its own); otherwise with the window.
- `opacity` below 1 on a view with children fades them as one picture, as on iOS and Android.
- A scroll view that holds a view with these effects repaints on each scroll frame instead of caching its content.
