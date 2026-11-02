---
id: scrollview
title: ScrollView
---

All upstream props work as documented in the [React Native ScrollView reference](https://reactnative.dev/docs/0.87/scrollview). This page lists only what desktop adds or changes.

## Desktop props

None. Style the scrollbar with the `ScrollBar` component below.

## ScrollBar

`ScrollBar` styles the scrollbar of the nearest `ScrollView`. Put it among the scroll view's children. A `FlatList` or `SectionList` takes it in `ListHeaderComponent` or `ListFooterComponent`. It draws nothing itself, and without one the default bar is used. `showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator` still turn the bar off.

```tsx
import { ScrollBar } from '@react-native-gpui/core/desktop';

<ScrollView>
  {children}
  <ScrollBar
    thickness={12}
    color="rgba(255, 99, 71, 0.6)"
    trackColor="rgba(0, 0, 0, 0.08)"
    visibility="always"
    onDragEnd={event => save(event.nativeEvent.contentOffset.y)}
  />
</ScrollView>;
```

The props are direct props. `style` is ignored.

| Prop            | Type                            | Description                                                                                                             |
| --------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `thickness`     | `number`                        | Width of a vertical bar, height of a horizontal one. Defaults to `6`.                                                   |
| `minLength`     | `number`                        | The shortest the thumb gets. Defaults to `24`.                                                                          |
| `margin`        | `number`                        | Space from the edge of the scroll view and at each end. Defaults to `2`.                                                |
| `color`         | `ColorValue`                    | The thumb's color. An alpha channel makes it translucent.                                                               |
| `radius`        | `number`                        | The thumb's corner radius. Defaults to half the thickness.                                                              |
| `trackColor`    | `ColorValue`                    | The strip behind the thumb. No track is drawn when unset.                                                               |
| `visibility`    | `'auto' \| 'always' \| 'hover'` | `'auto'` shows it while scrolling and at the edge, `'always'` whenever the content scrolls, `'hover'` only at the edge. |
| `autoHideDelay` | `number`                        | Milliseconds the bar stays after the last scroll. Defaults to `1200`.                                                   |
| `interactive`   | `boolean`                       | Whether the thumb can be dragged and revealed by the pointer. Defaults to `true`.                                       |
| `onDragStart`   | `(event) => void`               | The thumb started to drag.                                                                                              |
| `onDrag`        | `(event) => void`               | The thumb moved. Fires for every move.                                                                                  |
| `onDragEnd`     | `(event) => void`               | The thumb was released.                                                                                                 |

The events carry the scroll view's offset in `event.nativeEvent.contentOffset`.

## Differences

- `decelerationRate` applies to a touchpad flick on Windows and Linux: the fraction of its speed it keeps each millisecond, `0.998` for `'normal'` and `0.99` for `'fast'`. A mouse wheel has no momentum. On macOS the momentum comes from the system and the value has no effect.
- `snapToInterval`, `snapToOffsets`, `snapToStart`, `snapToEnd` and `pagingEnabled` settle on the nearest point once a wheel, trackpad or drag scroll comes to rest.
- `scrollEventThrottle` above one frame sends one event per interval, and the last one carries the offset the scroll ended at.
- The scroll indicator appears when the pointer reaches the edge of a scrollable view, and its thumb can be dragged. `showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator` turn it off.
- `RefreshControl` shows progress but has no pull gesture.
