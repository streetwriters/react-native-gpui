# @react-native-gpui/system

Operating system integration for react-native-gpui apps: start at login, restart the app, hide its windows from screenshots and screen sharing (privacy mode), read the user's idle time, and set the Dock badge or bounce the Dock icon.

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
  getIdleTime,
  setBadge,
  requestAttention,
} from '@react-native-gpui/system';

await setLaunchAtLogin(true, { hidden: true });
await setContentProtected(true);
await restart();
const seconds = await getIdleTime(); // since the last key, click or mouse move
await setBadge(3); // the number on the Dock icon
await requestAttention(); // bounce the Dock icon
```

macOS is supported first. `getIdleTime` also has a Windows implementation (`GetLastInputInfo`) that is untested, and rejects with `ERR_UNSUPPORTED` on Linux. Start at login is written for Windows and Linux too, but only macOS has been tested; restart works on Unix, and content protection, the badge and the bounce are macOS only for now.

## Documentation

[System](https://streetwriters.github.io/react-native-gpui/docs/desktop-system)

## License

MIT. See [LICENSE](LICENSE).
