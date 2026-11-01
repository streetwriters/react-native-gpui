---
id: pressable
title: Pressable
---

All upstream props work as documented in the [React Native Pressable reference](https://reactnative.dev/docs/0.87/pressable). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- Hovering is reported by the pointer events of the mouse, so `onHoverIn` and `onHoverOut` work. See [Mouse and keyboard input](desktop-input).
- `hitSlop` and `pressRetentionOffset` are applied to the pointer.
