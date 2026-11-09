---
id: textinput
title: TextInput
---

All upstream props work as documented in the [React Native TextInput reference](https://reactnative.dev/docs/0.87/textinput). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- Text composition with an input method (IME) has not been tested.
- `contextMenuHidden` suppresses the context menu on right click.
- `submitBehavior` decides whether Enter submits, blurs or inserts a newline.
- A single-line input with no `height` is as tall as a line of `Text` in the same font and size, plus its padding and border: the line box is the font's ascent and descent each rounded to a device pixel, or the `lineHeight` when one is set. An empty input with no placeholder has the same height.
