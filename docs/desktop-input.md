---
id: desktop-input
title: Mouse and keyboard input
---

Desktop apps are driven by a mouse or trackpad and a keyboard. This page describes the events a view receives from them.

## Mouse buttons

Mouse buttons use the W3C numbering:

| `button` | Button            |
| -------- | ----------------- |
| `0`      | Left (primary)    |
| `1`      | Middle            |
| `2`      | Right (secondary) |
| `3`      | Back              |
| `4`      | Forward           |

The left button is a press. It drives React Native's responder system, so `Pressable`, `Button` and the `Touchable` components react to it, and the touch events (`onTouchStart`, `onTouchMove`, `onTouchEnd`) fire.

The other buttons never start a press: a right click does not make a `Pressable` fire `onPress`. They are only reported by the pointer events below. A right click also opens a [context menu](desktop-context-menus), and the back button fires [`BackHandler`](https://reactnative.dev/docs/0.87/backhandler).

## Pointer events

`View` takes the pointer events of the web. Each has a capturing counterpart, such as `onPointerDownCapture`.

| Prop              | Fires                                               |
| ----------------- | --------------------------------------------------- |
| `onPointerDown`   | A button is pressed over the view.                  |
| `onPointerUp`     | A button is released.                               |
| `onPointerMove`   | The pointer moves over the view.                    |
| `onPointerCancel` | The press is interrupted.                           |
| `onPointerEnter`  | The pointer enters the view. It does not bubble.    |
| `onPointerLeave`  | The pointer leaves the view. It does not bubble.    |
| `onPointerOver`   | The pointer enters the view or one of its children. |
| `onPointerOut`    | The pointer leaves the view or one of its children. |

```tsx
<View
  onPointerEnter={() => setHovered(true)}
  onPointerLeave={() => setHovered(false)}
  onPointerDown={event => {
    if (event.nativeEvent.button === 2) openMenu();
  }}
  style={{ backgroundColor: hovered ? '#eee' : 'white' }}
/>
```

The event's `nativeEvent` has these fields:

| Field                                                                        | Meaning                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pointerType`                                                                | Always `'mouse'`. Trackpads report as a mouse.                                       |
| `pointerId`, `isPrimary`                                                     | One pointer exists, and it is primary.                                               |
| `button`                                                                     | The button that changed, or `-1` for a move.                                         |
| `buttons`                                                                    | A mask of the buttons held: 1 left, 2 right, 4 middle, 8 back, 16 forward.           |
| `ctrlKey`, `shiftKey`, `altKey`, `metaKey`                                   | The modifier keys held. `metaKey` is Command on macOS and the Windows key elsewhere. |
| `clientX`, `clientY` (also `x`, `y`, `pageX`, `pageY`, `screenX`, `screenY`) | The pointer position in the window, in points.                                       |
| `offsetX`, `offsetY`                                                         | The position inside the view that the event is sent to.                              |
| `target`                                                                     | The tag of the view under the pointer.                                               |

## Scrolling

The mouse wheel and the trackpad scroll a [`ScrollView`](scrollview) and the lists built on it. To take the wheel for your own content, such as a canvas, a map or a document viewer, use the wheel events below.

## Wheel events

`View` takes `onWheel` and `onWheelCapture`. The event bubbles like the pointer events: the capture handlers run from the outermost view to the one under the pointer, then the bubble handlers from the innermost outwards. It is sent to the innermost view under the pointer.

```tsx
<View
  onWheel={event => {
    event.preventDefault();
    const { deltaX, deltaY, ctrlKey } = event.nativeEvent;
    if (ctrlKey) zoomBy(-deltaY * 0.01);
    else panBy(-deltaX, -deltaY);
  }}
/>
```

The `nativeEvent` follows the web's `WheelEvent`:

| Field                                                                        | Meaning                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `deltaX`, `deltaY`, `deltaZ`                                                 | The change, with the signs of the web: positive `deltaY` scrolls down and positive `deltaX` scrolls right.                      |
| `deltaMode`                                                                  | `0` when the deltas are pixels, `1` when they are lines. A trackpad reports pixels at full precision, not rounded.              |
| `isTrackpad`                                                                 | `true` for a trackpad or another continuous device, `false` for a mouse wheel.                                                  |
| `phase`                                                                      | `'began'`, `'changed'`, `'ended'` or `'cancelled'` for a trackpad gesture, and `'none'` for a mouse wheel notch.                |
| `momentum`                                                                   | `true` for the inertial events a trackpad sends after the fingers lift.                                                         |
| `isPinch`                                                                    | `true` for a trackpad pinch.                                                                                                    |
| `ctrlKey`, `shiftKey`, `altKey`, `metaKey`                                   | The modifier keys held. A pinch reports `ctrlKey: true`, as browsers do, so web zoom code works unchanged.                      |
| `clientX`, `clientY` (also `x`, `y`, `pageX`, `pageY`, `screenX`, `screenY`) | The pointer position in the window, in points.                                                                                  |
| `offsetX`, `offsetY`                                                         | The position inside the view that the event is sent to.                                                                         |
| `target`                                                                     | The tag of the view that the event is sent to.                                                                                  |
| `timestamp`                                                                  | When the platform delivered the event, in milliseconds since the epoch. `Date.now() - timestamp` is the latency to the handler. |

A pinch is a wheel event whose `deltaY` is the magnification change, negated and multiplied by 100, so a 5% zoom in is `-5`. A mouse wheel with shift held reports the vertical notch as `deltaX`, as browsers do. Every event is delivered in the order the platform sent it, and none is dropped.

`preventDefault()` and `stopPropagation()` keep the event from scrolling a parent `ScrollView`, so a view can take the wheel from the scroll view around it. An event that no handler prevents scrolls as before, once the handlers have run. A view with no wheel handler on its path scrolls at once, without waiting for JavaScript.

Pinch events come from the macOS trackpad. Windows and Linux report a pinch as nothing. Momentum is recognised on a trackpad that sends precise deltas: the `'moved'` events after a gesture ends are `momentum`.

## Keyboard

A view receives key events while it has keyboard focus. Make a view focusable with the [`focusable`](view#desktop-props) prop, or use a component that takes focus itself, such as `TextInput`.

| Prop        | Fires                                   |
| ----------- | --------------------------------------- |
| `onKeyDown` | A key is pressed, and while it repeats. |
| `onKeyUp`   | A key is released.                      |
| `onFocus`   | The view gets focus.                    |
| `onBlur`    | The view loses focus.                   |

```tsx
<View
  focusable
  onKeyDown={event => {
    if (event.nativeEvent.key === 'Escape') close();
  }}
/>
```

The key event's `nativeEvent` has:

| Field                                      | Meaning                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `key`                                      | The key as the web names it: `'a'`, `'Enter'`, `'ArrowLeft'`. |
| `code`                                     | The physical key, such as `'KeyA'`.                           |
| `keyCode`                                  | The legacy numeric key code.                                  |
| `repeat`                                   | `true` while the key is held down.                            |
| `ctrlKey`, `shiftKey`, `altKey`, `metaKey` | The modifier keys held.                                       |

`onFocus` events carry `focusVisible`, which is `true` when focus arrived through the keyboard. Use it to draw a focus ring only for keyboard users.

For shortcuts that should work wherever the user is in the app, use [keyboard shortcuts](desktop-keyboard-shortcuts) instead of `onKeyDown`. They are resolved natively, and take precedence over a text input and over menu accelerators.

## Text input

`TextInput` handles typing, selection with the mouse and the keyboard, the clipboard, and input methods for you. See [TextInput](textinput).
