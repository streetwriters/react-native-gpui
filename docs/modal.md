---
id: modal
title: Modal
---

All upstream props work as documented in the [React Native Modal reference](https://reactnative.dev/docs/0.87/modal). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- `onRequestClose` is called when Escape is pressed while the modal is open, and when the window's close button is pressed. The modal, and the window, stay until JavaScript hides the modal.
- `onDismiss` is called after the modal has been hidden.
