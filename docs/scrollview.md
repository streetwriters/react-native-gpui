---
id: scrollview
title: ScrollView
---

All upstream props work as documented in the [React Native ScrollView reference](https://reactnative.dev/docs/0.87/scrollview). This page lists only what desktop adds or changes.

## Desktop props

### `onScrollBarDragStart`, `onScrollBarDrag`, `onScrollBarDragEnd`

```tsx
<ScrollView
  onScrollBarDragEnd={event => save(event.nativeEvent.contentOffset.y)}
/>
```

Called when the scrollbar's thumb is dragged with the pointer: the first move, each move, and the release. The event's `nativeEvent.contentOffset` is the scroll offset, `{ x, y }`. They are props of every scroll view, so `FlatList`, `SectionList` and `VirtualizedList` pass them on. A thumb can be dragged without any handler set. Style the scrollbar with the `ScrollBar` component below; its own `onDrag*` props report the same drags.

## ScrollBar

[`ScrollBar`](scrollbar) styles the scrollbar of the nearest `ScrollView`. Put it among the scroll view's children. It draws nothing itself, and without one the default bar is used.

## Differences

- A horizontal scroll view scrolls with a sideways trackpad swipe, and with a vertical wheel while shift is held, as a browser's does. A vertical wheel alone does not move it. A vertical scroll view takes only the vertical axis, so one inside a horizontal scroll view scrolls up and down while a sideways swipe over it moves the outer one.

- `decelerationRate` applies to a touchpad flick on Windows and Linux: the fraction of its speed it keeps each millisecond, `0.998` for `'normal'` and `0.99` for `'fast'`. A mouse wheel has no momentum. On macOS the momentum comes from the system and the value has no effect.
- `snapToInterval`, `snapToOffsets`, `snapToStart`, `snapToEnd` and `pagingEnabled` settle on the nearest point once a wheel, trackpad or drag scroll comes to rest, on the vertical and on the horizontal axis (`horizontal` with `pagingEnabled` rests on whole pages). `snapToAlignment` is `start`, `center` or `end`.
- `scrollEventThrottle` above one frame sends one event per interval, and the last one carries the offset the scroll ended at.
- The scroll indicator appears when the pointer reaches the edge of a scrollable view, and its thumb can be dragged. It is hidden at rest and shown while the user scrolls, for about 1.2 seconds afterwards and while the pointer is at the edge, as an overlay scrollbar is. A scroll the app asks for with `scrollTo` or `scrollToEnd` does not show it; `flashScrollIndicators()` does. A `ScrollBar` child sets `visibility` and `autoHideDelay`.
- On macOS, when the system draws scrollers the legacy way (System Settings, Appearance, "Show scroll bars: Always", or "Automatically" with a mouse connected), the bar is always shown, 12 points wide on a light track, unless a `ScrollBar` sets `visibility` or `thickness`. The app follows the setting as it changes. The bar takes 12 points from the content on the scroll axis, as AppKit's and Chromium's classic scroll bars do: the content container is that much narrower (vertical) or shorter (horizontal), and the layout follows the setting as it changes. A scroll view with `showsVerticalScrollIndicator={false}` (or the horizontal prop) or `scrollEnabled={false}` keeps its full width. A `ScrollBar` child with a `thickness` prop reserves that thickness instead of 12. `RN_GPUI_SCROLLER_STYLE=legacy` or `overlay` forces the style on any platform, for tests. `showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator` turn it off.
- `RefreshControl` shows progress but has no pull gesture.
