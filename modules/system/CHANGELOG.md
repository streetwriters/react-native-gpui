# Changelog

All notable changes to `@react-native-gpui/system` are listed here. Each version's section becomes the notes of its GitHub release.

## Unreleased

- First version.
- Start the app at login, optionally hidden, and query the setting.
- Restart the app, with the same or new arguments.
- `setBadge()` and `getBadge()` for the number or text on the Dock icon, and `requestAttention()` and `cancelAttention()` to bounce it (macOS).
- `getIdleTime()` reports the seconds since the user last used the keyboard, mouse or trackpad in the session (macOS and Windows).
- `setJumpList(tasks)` sets the tasks in the Windows jump list, each starting the app with arguments (not tested yet).
- Content protection: hide every window of the app from screenshots, recordings and screen sharing (macOS; Windows through `SetWindowDisplayAffinity`, not tested yet).
