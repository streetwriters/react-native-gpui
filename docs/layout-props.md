---
id: layout-props
title: Layout Props
---

All upstream props work as documented in the [React Native Layout Props reference](https://reactnative.dev/docs/0.87/layout-props). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- `isolation: 'isolate'` forms a stacking context: its descendants are painted into a picture of their own, so a `mixBlendMode` inside blends only with what is inside it.
