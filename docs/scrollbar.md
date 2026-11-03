---
id: scrollbar
title: ScrollBar
---

Styles the scrollbar of the nearest [`ScrollView`](scrollview). Put it among the scroll view's children. A `FlatList` or `SectionList` takes it in `ListHeaderComponent` or `ListFooterComponent`.

It draws nothing itself, and without one the default bar is used. `showsVerticalScrollIndicator` and `showsHorizontalScrollIndicator` still turn the bar off. The props are direct props; `style` is ignored.

## Example

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

---

# Reference

## Props

### `thickness`

Width of a vertical bar, height of a horizontal one.

| Type   | Default |
| ------ | ------- |
| number | `6`     |

---

### `minLength`

The shortest the thumb gets, however long the content.

| Type   | Default |
| ------ | ------- |
| number | `24`    |

---

### `margin`

Space from the edge of the scroll view and at each end.

| Type   | Default |
| ------ | ------- |
| number | `2`     |

---

### `color`

The thumb's colour. An alpha channel makes it translucent.

| Type                                              |
| ------------------------------------------------- |
| [color](https://reactnative.dev/docs/0.87/colors) |

---

### `radius`

The thumb's corner radius.

| Type   | Default            |
| ------ | ------------------ |
| number | half the thickness |

---

### `trackColor`

The strip behind the thumb. No track is drawn when unset.

| Type                                              |
| ------------------------------------------------- |
| [color](https://reactnative.dev/docs/0.87/colors) |

---

### `visibility`

`'auto'` shows the bar while scrolling and at the edge, `'always'` whenever the content scrolls, `'hover'` only at the edge.

| Type                                  | Default  |
| ------------------------------------- | -------- |
| enum(`'auto'`, `'always'`, `'hover'`) | `'auto'` |

---

### `autoHideDelay`

Milliseconds the bar stays after the last scroll.

| Type   | Default |
| ------ | ------- |
| number | `1200`  |

---

### `interactive`

Whether the thumb can be dragged and revealed by the pointer.

| Type    | Default |
| ------- | ------- |
| boolean | `true`  |

---

### `onDragStart`

The thumb started to drag. The event has the scroll view's `contentOffset`.

| Type     |
| -------- |
| function |

---

### `onDrag`

The thumb moved. Fires for every move.

| Type     |
| -------- |
| function |

---

### `onDragEnd`

The thumb was released.

| Type     |
| -------- |
| function |
