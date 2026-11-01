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

- `cursor` sets the mouse cursor over the view.
- `filter` applies every function in the order listed. `blur` and `dropShadow` paint the view and its descendants into a picture of their own and work on that picture. The colour functions colour each drawn shape, image and glyph.
- `mixBlendMode` blends the view and its descendants, painted into a picture of their own, with the nearest ancestor that is a stacking context (an `isolation: 'isolate'` view, a view with a `filter`, an `opacity` below 1 with children, or a `mixBlendMode` of its own); otherwise with the window.
- `opacity` below 1 on a view with children fades them as one picture, as on iOS and Android.
- A scroll view that holds a view with these effects repaints on each scroll frame instead of caching its content.
