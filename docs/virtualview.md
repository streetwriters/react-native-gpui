---
id: virtualview
title: VirtualView
---

All upstream props work as documented in the [React Native VirtualView reference](https://reactnative.dev/docs/0.87/virtualview). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- The renderer decides the mode of a `VirtualView` from where it lies in its `ScrollView`: visible in the viewport, prerendered within five viewports of it along the scroll axis, hidden beyond. React hears each change as `onModeChange`.
