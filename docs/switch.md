---
id: switch
title: Switch
---

All upstream props work as documented in the [React Native Switch reference](https://reactnative.dev/docs/0.87/switch). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- The switch is drawn by the app in the style of each operating system and measured natively: 38×22 points on macOS, 40×20 on Windows and 46×26 on Linux.
- A click, or Space or Enter when the switch has focus, flips it and calls `onValueChange`. When `value` is not updated, the switch returns to its old position.
