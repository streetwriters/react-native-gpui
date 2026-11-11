---
id: text
title: Text
---

All upstream props work as documented in the [React Native Text reference](https://reactnative.dev/docs/0.87/text). This page lists only what desktop adds or changes.

## Desktop props

| Name                    | Type     | Behaviour                                                           |
| ----------------------- | -------- | ------------------------------------------------------------------- |
| `accessibilityLanguage` | `string` | The language of the text for assistive technology, as a BCP 47 tag. |

## Differences

- The generic families `system-ui`, `ui-sans-serif`, `ui-serif` and `ui-monospace` resolve to the system fonts. See [Fonts](https://github.com/streetwriters/react-native-gpui-modules/blob/main/modules/fonts/docs/fonts.md) to load your own.
- Selection works with the mouse and the keyboard shortcuts of each platform when `selectable` is set.
