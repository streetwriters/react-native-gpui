---
id: scrollview
title: ScrollView
---

All upstream props work as documented in the [React Native ScrollView reference](https://reactnative.dev/docs/0.87/scrollview). This page lists only what desktop adds or changes.

## Desktop props

None. Style the scrollbar with the `ScrollBar` component below.

## ScrollBar

[`ScrollBar`](scrollbar) styles the scrollbar of the nearest `ScrollView`. Put it among the scroll view's children. It draws nothing itself, and without one the default bar is used.

## Differences

- `decelerationRate` applies to a touchpad flick on Windows and Linux: the fraction of its speed it keeps each millisecond, `0.998` for `'normal'` and `0.99` for `'fast'`. A mouse wheel has no momentum. On macOS the momentum comes from the system and the value has no effect.
- `snapToInterval`, `snapToOffsets`, `snapToStart`, `snapToEnd` and `pagingEnabled` settle on the nearest point once a wheel, trackpad or drag scroll comes to rest.
- `scrollEventThrottle` above one frame sends one event per interval, and the last one carries the offset the scroll ended at.
- The scroll indicator appears when the pointer reaches the edge of a scrollable view, and its thumb can be dragged. `showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator` turn it off.
- `RefreshControl` shows progress but has no pull gesture.
