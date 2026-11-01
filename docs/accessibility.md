---
id: accessibility
title: Accessibility
description: Create desktop apps accessible to assistive technology with React Native's suite of accessibility APIs.
---

All upstream accessibility props and actions work as documented in the [React Native accessibility guide](https://reactnative.dev/docs/0.87/accessibility). This page lists only what is different on desktop.

react-native-gpui describes your app to the operating system as an accessibility tree, read by VoiceOver on macOS, Narrator on Windows and Orca on Linux. Every view with the right props becomes a node of that tree, with a role, a label, a state and actions.

:::info
**VoiceOver on macOS** is the supported path today. The accessibility tree is also produced on Windows and Linux, but screen reader support there has not been validated yet. See [Platform support](platform-support#known-limitations).
:::

## Platform-specific props that work on desktop

Upstream marks these props as iOS-only or Android-only. On desktop they work on every operating system.

| Prop                                         | Upstream | Desktop behaviour                                                                                                          |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `accessibilityLabelledBy`, `aria-labelledby` | Android  | The label is the text of the view whose `nativeID` matches.                                                                |
| `accessibilityLanguage`                      | iOS      | Sets the language the screen reader uses for the label, value and hint.                                                    |
| `accessibilityLiveRegion`, `aria-live`       | Android  | `polite` and `assertive` changes are announced; `none` and `off` are not.                                                  |
| `accessibilityViewIsModal`, `aria-modal`     | iOS      | Hides the view's siblings from the screen reader and keeps keyboard focus inside the view.                                 |
| `accessibilityElementsHidden`, `aria-hidden` | iOS      | Hides the view and its children from the screen reader.                                                                    |
| `importantForAccessibility`                  | Android  | `no-hide-descendants` hides the view and its children, `no` hides only the view, `yes` exposes it.                         |
| `onAccessibilityEscape`                      | iOS      | Called when the **Escape** key is pressed while focus is inside the view. The nearest ancestor with a handler receives it. |
| `onAccessibilityTap`                         | iOS      | Called when the screen reader activates the view.                                                                          |

## Accessibility actions

The standard actions map to the operating system's actions:

| Action                   | Desktop                                  |
| ------------------------ | ---------------------------------------- |
| `activate`               | Click                                    |
| `increment`, `decrement` | Increment, decrement (role `adjustable`) |
| `longpress`              | Show context menu                        |
| `expand`, `collapse`     | Expand, collapse                         |

Other names become custom actions, listed by the screen reader with their `label`.

## Differences

- `experimental_accessibilityOrder` is not supported. Focus order follows the view tree.
- `onMagicTap` is not supported; desktop screen readers have no magic tap gesture.
- `accessibilityIgnoresInvertColors`, `accessibilityShowsLargeContentViewer`, `accessibilityLargeContentTitle` and `accessibilityRespondsToUserInteraction` have no effect on desktop.
- `screenReaderFocusable` has no effect: a view is reachable by the screen reader when it is `accessible`.

To check whether a screen reader is running, see [AccessibilityInfo](accessibilityinfo).

## Additional resources

- [Accessibility on macOS](https://developer.apple.com/accessibility/), [on Windows](https://learn.microsoft.com/windows/apps/design/accessibility/) and [on Linux](https://developer.gnome.org/documentation/guidelines/accessibility.html)
