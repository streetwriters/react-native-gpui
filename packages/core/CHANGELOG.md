# Changelog

All notable changes to `@react-native-gpui/core` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- The keyboard focus ring is no longer drawn around a `TextInput`, or around a view that sets its own outline.
- `titleBar: 'none'` removes all system chrome: on macOS a borderless window with no border line or system corners.
- Fixed an empty `TextInput` drawing its placeholder at a different size than typed text and its caret in the wrong color, which flickered when the text was cleared.
- Windows take `windowButtons` and `shadow` options to hide the macOS traffic lights and the system shadow.
- Windows can be `transparent`, `blurred` or `mica` with the `background` window option, in `desktop.json` and in `DesktopWindow.open`.
- `StatusBar` renders nothing and its methods do nothing on desktop, so the default React Native app no longer fails on a missing native module.
- `ScrollBar` styles the scrollbar of the nearest `ScrollView`, including a list's: thickness, colors, radius, margin, visibility, auto-hide, and drag events. It needs a new prebuilt runtime.
- The scroll indicator can be dragged, and appears when the pointer reaches the edge of a scrollable view.
- The prebuilt runtime download reports its progress and where it was installed.
- Fixed a view with a `borderWidth` and a `borderRadius` drawing a square border over its rounded background, as on the `NewAppScreen` cards.
- Fixed a scroll view jumping up when a press re-rendered it after a trackpad flick had carried it past the end.

## 0.87.0-alpha.0 - 2026-11-01

- First release of the React Native desktop platform for macOS, Windows and Linux, for React Native 0.87.
- One GPU-accelerated renderer (GPUI) draws the core components on every platform, through Fabric and Yoga.
- Desktop APIs: multiple windows, application and context menus, a tray icon, keyboard shortcuts, deep links and single-instance apps.
- Accessibility tree for VoiceOver, Narrator and Orca; VoiceOver on macOS is the validated path.
- `Intl` on the system ICU.
- Uses the prebuilt C++ runtime 0.0.6, downloaded on the first build; set `prebuilt: 'never'` to build it from source.
