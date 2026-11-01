# Changelog

All notable changes to `@react-native-gpui/core` are listed here. Each version's section becomes the notes of its GitHub release.

## 0.87.0-alpha.0 - 2026-11-01

- First release of the React Native desktop platform for macOS, Windows and Linux, for React Native 0.87.
- One GPU-accelerated renderer (GPUI) draws the core components on every platform, through Fabric and Yoga.
- Desktop APIs: multiple windows, application and context menus, a tray icon, keyboard shortcuts, deep links and single-instance apps.
- Accessibility tree for VoiceOver, Narrator and Orca; VoiceOver on macOS is the validated path.
- `Intl` on the system ICU.
- Uses the prebuilt C++ runtime 0.0.6, downloaded on the first build; set `prebuilt: 'never'` to build it from source.
