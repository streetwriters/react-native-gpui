# @react-native-gpui/system

Operating system integration for react-native-gpui apps: start at login, restart the app, and hide its windows from screenshots and screen sharing (privacy mode).

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/system
```

## Usage

```js
import {
  setLaunchAtLogin,
  getLaunchAtLogin,
  restart,
  setContentProtected,
} from '@react-native-gpui/system';

await setLaunchAtLogin(true, { hidden: true });
await setContentProtected(true);
await restart();
```

macOS is supported first. Start at login is written for Windows and Linux too, but only macOS has been tested; restart works on Unix, and content protection is macOS only for now.

## Documentation

[System](https://streetwriters.github.io/react-native-gpui/docs/desktop-system)

## License

MIT. See [LICENSE](LICENSE).
