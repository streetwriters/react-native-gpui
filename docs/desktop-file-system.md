---
id: desktop-file-system
title: File system
---

`@react-native-gpui/fs` is a file system API for desktop apps. It follows `node:fs`, so code and habits from Node carry over, and adds file dialogs and the well-known folders of the operating system.

```shell
npm install @react-native-gpui/fs
```

```js
import fs, { dialog, paths } from '@react-native-gpui/fs';
```

The module runs on its own thread, so a slow file never blocks JavaScript or the interface.

## Reading and writing

The default export is the `node:fs` object, with synchronous, callback and promise forms:

```js
const text = fs.readFileSync(`${paths.documents}/notes.txt`, 'utf8');

await fs.promises.writeFile(
  `${paths.appData}/state.json`,
  JSON.stringify(state),
);

const entries = await fs.promises.readdir(paths.downloads, {
  withFileTypes: true,
});
```

The common operations are available: `readFile`, `writeFile`, `appendFile`, `stat`, `lstat`, `readdir`, `mkdir`, `rm`, `rename`, `copyFile`, `cp`, `access`, `realpath`, `readlink`, `symlink`, `truncate`, `utimes`, `chmod`, `mkdtemp`, `open` with `FileHandle`, and `existsSync`. Encodings, `Stats`, `Dirent`, flags and `constants` behave as they do in Node. Errors carry Node's error codes, such as `ENOENT`.

Text is read and written as UTF-8 directly in native code. Other encodings and binary data go through `ArrayBuffer`.

## Well-known folders

`paths` holds the folders the operating system defines. They are created the first time you read them:

| Name        | Folder                                     |
| ----------- | ------------------------------------------ |
| `home`      | The user's home folder.                    |
| `documents` | Documents.                                 |
| `downloads` | Downloads.                                 |
| `desktop`   | The desktop.                               |
| `temp`      | The temporary folder.                      |
| `appData`   | Where the app keeps its data.              |
| `appCache`  | Where the app keeps files it can recreate. |
| `appLogs`   | Where the app writes logs.                 |

## Dialogs

`dialog` opens the platform's file pickers. Cancelling is not an error: `open` resolves with an empty array, and `save` with `null`.

```js
const [file] = await dialog.open({
  title: 'Choose a document',
  filters: [{ name: 'Text', extensions: ['txt', 'md'] }],
});

const target = await dialog.save({ defaultName: 'export.json' });
```

| `dialog.open` option | Description                        |
| -------------------- | ---------------------------------- |
| `title`              | The title of the dialog.           |
| `defaultPath`        | The folder to start in.            |
| `multiple`           | Allow several files.               |
| `directory`          | Choose a folder instead of a file. |
| `filters`            | `{name, extensions}` entries.      |

`dialog.save` takes `title`, `defaultPath`, `defaultName` and `filters`. On Linux the dialogs use the XDG portal, so GTK is not required.

## Reveal and open

```js
await fs.promises.reveal(path); // show the file in Finder, Explorer or the file manager
await fs.promises.openExternal(path); // open a file or URL with its default application
```

## Watching

`watch(path, listener)` watches a file or folder, as in Node. The listener receives `'rename'` or `'change'` and the file name, and the watcher it returns has a `close()` method.
