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

## Running the Rust tests

The crate has no `[patch.crates-io]` block, so point Cargo at the local core crates. From the repository root:

```sh
R=$PWD/packages/core/ReactGpui
scripts/locked-build.sh cargo test --manifest-path modules/updater/desktop/Cargo.toml \
  --config "patch.crates-io.react-native-gpui.path='$R/rn-gpui'" \
  --config "patch.crates-io.rn-gpui-sys.path='$R/rn-gpui-sys'" \
  --config "patch.crates-io.rn-gpui-module.path='$R/rn-gpui-module'" \
  --config "patch.crates-io.rn-gpui-module-build.path='$R/rn-gpui-module-build'" \
  --config "patch.crates-io.gpui.git='https://github.com/streetwriters/gpui-fast'" --config "patch.crates-io.gpui.rev='5392403'" \
  --config "patch.crates-io.gpui_platform.git='https://github.com/streetwriters/gpui-fast'" --config "patch.crates-io.gpui_platform.rev='5392403'"
```

## Documentation

[Updater](https://streetwriters.github.io/react-native-gpui/docs/desktop-updater)

## License

MIT. See [LICENSE](LICENSE).
