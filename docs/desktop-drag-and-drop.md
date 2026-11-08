---
id: desktop-drag-and-drop
title: Dragging views
---

A view can be dragged to another view of the app, as with HTML drag and drop. It is driven by the pointer and needs no operating system drag session, so it works the same on every platform. Dragging to another window or out to the file manager is not supported. For files dragged in from the system see [`acceptsFiles`](view#files-dropped-from-the-system).

## Source and target

```tsx
import { DragDrop } from '@react-native-gpui/core/desktop';

<View
  draggable
  onDragStart={() => DragDrop.setPayload({ id: note.id })}
  onDragEnd={event => event.nativeEvent.dropped}
/>

<View
  droppable
  dragOverStyle={{ backgroundColor: '#dbeafe' }}
  onDragEnter={() => {}}
  onDrop={() => move(DragDrop.getPayload<{ id: string }>()!.id)}
/>
```

| Prop                                       | On         | Fires                                                                 |
| ------------------------------------------ | ---------- | --------------------------------------------------------------------- |
| `draggable`                                | the source | Lets a press that moves 4 points start a drag.                        |
| `onDragStart`, `onDrag`, `onDragEnd`       | the source | The drag starts, the pointer moves, the drag ends (`dropped` is set). |
| `droppable`                                | the target | Makes the view a target. The nearest one under the pointer is used.   |
| `onDragEnter`, `onDragOver`, `onDragLeave` | the target | The pointer enters, moves over, leaves the target.                    |
| `onDrop`                                   | the target | The button is released over the target.                               |

The source's events carry `target` (its tag), `pageX` and `pageY`. The target's events carry `x` and `y` in the view, `pageX` and `pageY`, `files` (empty) and `source`, the tag of the dragged view. `dragOverStyle` applies to the target while a drag is over it.

The nearest `draggable` ancestor of the pressed view is the source, so a drag can start on a child. Children that handle the press themselves, such as a text input selecting, start a drag only if the press moves.

## Payload

The payload lives in JavaScript. Set it with `DragDrop.setPayload(value)` in `onDragStart`; read it with `DragDrop.getPayload()` in the target's handlers. It stays readable after the drag has ended, until the next drag starts, so `onDrop` sees it whatever the order the events arrive in.

`DragDrop.getState()`, `useDragState()` and `useIsDragging()` give `{ active, source, payload, x, y, over }`: whether a drag is in progress, the dragged view's tag, the pointer in the window and the tag of the target it is over.

## Preview

`DragPreview` draws a view beside the pointer while a drag is in progress. Mount it once, last in a root view that fills the window:

```tsx
<DragPreview<Note>
  render={note => <NoteCard note={note} />}
  offset={{ x: 12, y: 12 }}
/>
```

The preview never takes pointer events. To draw something else, build it from `useDragState()`.

## Auto-scrolling

`useDragAutoScroll(ref, { edge, speed, horizontal })` scrolls a `ScrollView` while a drag is held within `edge` points of its edge (40 by default), up to `speed` points per frame (14), faster nearer the edge. Spread the result on the scroll view:

```tsx
const ref = useRef<ScrollView>(null);
<ScrollView ref={ref} {...useDragAutoScroll(ref)} />;
```

`DragDrop.onMove(listener)` gives the pointer position on each move for other uses, such as expanding a folder after hovering over it.

## Details

The drag ends on the release, or when Escape is pressed: the target gets `onDragLeave`, nothing drops, and the source's `onDragEnd` has `dropped` false. The rest of the press is ignored. It also ends or when no node answers it anywhere in the window. Device events `gpuiDesktop:dragStart`, `gpuiDesktop:dragMove` and `gpuiDesktop:dragEnd` carry the same stream. A move without a button held is ignored.
