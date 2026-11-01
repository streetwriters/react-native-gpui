---
id: refreshcontrol
title: RefreshControl
---

All upstream props work as documented in the [React Native RefreshControl reference](https://reactnative.dev/docs/0.87/refreshcontrol). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- It shows an activity indicator at the top of the scroll view while `refreshing` is `true`. There is no pull gesture, so `onRefresh` is not called by the user. Offer a button or a keyboard shortcut.
