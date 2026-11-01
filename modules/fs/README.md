# @react-native-gpui/fs

A file system API for desktop apps, shaped like Node's `node:fs`, with file dialogs and the operating system's well-known folders.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/fs
```

## Usage

```js
import fs, { dialog, paths } from '@react-native-gpui/fs';

const text = fs.readFileSync(`${paths.documents}/notes.txt`, 'utf8');
await fs.promises.writeFile(
  `${paths.appData}/state.json`,
  JSON.stringify(state),
);

const [file] = await dialog.open({
  filters: [{ name: 'Text', extensions: ['txt'] }],
});
```

The default export has the synchronous, callback and promise forms of the common `node:fs` calls, with Node's encodings, `Stats`, `Dirent` and error codes. The module runs on its own thread, so slow files never block JavaScript or the interface.

## Documentation

[File system](https://streetwriters.github.io/react-native-gpui/docs/desktop-file-system)

## License

MIT. See [LICENSE](LICENSE).
