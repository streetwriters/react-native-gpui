# @react-native-gpui/updater

Checks a release feed for a newer version of a packaged react-native-gpui app, downloads it, verifies it and installs it.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/updater
```

## Usage

```js
import updater from '@react-native-gpui/updater';

updater.configure({
  feedUrl: 'https://example.com/releases/darwin/beta',
  channel: 'beta',
});

const update = await updater.checkForUpdates();
if (update) {
  await updater.downloadUpdate();
  await updater.installUpdate();
}
```

The feed is the `latest-mac.yml` (or `<channel>-mac.yml`) file that electron-builder publishes. Only macOS is supported for now.

## Documentation

[Updater](https://streetwriters.github.io/react-native-gpui/docs/desktop-updater)

## License

MIT. See [LICENSE](LICENSE).
