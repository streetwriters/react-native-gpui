# @react-native-gpui/notifications

Desktop notifications for react-native-gpui apps: show a notification, schedule one for a time or on a daily, weekly or monthly repeat, cancel and list them, ask for permission, and receive taps and action presses as events.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/notifications
```

## Usage

```js
import notifications from '@react-native-gpui/notifications';

await notifications.requestPermission();

await notifications.schedule(
  { id: 'standup', title: 'Stand-up', body: 'Starts in five minutes' },
  { timestamp: Date.now() + 60_000, repeat: 'daily' },
);

notifications.onEvent(event => {
  if (event.type === 'press') openNote(event.notification.data?.noteId);
});
```

Scheduled notifications live in the running app and are not kept across a restart. On macOS, actions, taps and permissions need the app to run as a bundle; an unbundled debug binary posts plain notifications only. Windows and Linux are not supported yet.

## Documentation

[Notifications](https://streetwriters.github.io/react-native-gpui/docs/desktop-notifications)

## License

MIT. See [LICENSE](LICENSE).
