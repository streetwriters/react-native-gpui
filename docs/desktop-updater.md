---
id: desktop-updater
title: Updater
---

`@react-native-gpui/updater` updates a packaged app from a release feed: it checks for a newer version on a release track, downloads it with progress, verifies the download, and replaces the app. macOS only for now.

```shell
npm install @react-native-gpui/updater
```

```js
import updater from '@react-native-gpui/updater';

updater.configure({
  feedUrl: 'https://example.com/releases/darwin/beta',
  channel: 'beta',
});

const subscription = updater.addListener('progress', ({ percent }) =>
  setPercent(percent),
);

const update = await updater.checkForUpdates();
if (update) {
  await updater.downloadUpdate();
  await updater.installUpdate();
}
```

## The feed

`feedUrl` is a folder on a server. The updater reads `<feedUrl>/<channel>-mac.yml`, where `channel` is the release track and defaults to `latest`, and downloads the archive the file names, next to it. The file is the one electron-builder writes, so an existing feed for an Electron app can be reused:

```yaml
version: 3.2.1
files:
  - url: Notesnook-3.2.1-mac.zip
    sha512: <base64 SHA-512 of the archive>
    size: 123456789
releaseDate: '2026-01-02T03:04:05.000Z'
```

The updater takes the first `.zip` in `files`, or `path` when that is a `.zip`. The archive is the app bundle zipped, as `ditto -c -k --keepParent MyApp.app MyApp.zip` makes it. A feed without a `sha512` for the archive is refused. Switching tracks is `configure` with another `channel`, then `checkForUpdates`.

## Checking

`checkForUpdates()` resolves with `{ version, releaseDate?, size }`, or `null` when the app is up to date. Versions follow semver, so `1.1.0` is newer than `1.1.0-beta.2`. With `allowDowngrade: true` a version that is older than the running one is offered too, which is how a user who leaves a pre-release track gets back to the stable one. The running version is `currentVersion` if given, otherwise the bundle's `CFBundleShortVersionString`.

## Downloading

`downloadUpdate()` downloads the archive found by the last check into the app's cache folder, `~/Library/Caches/<bundle id>/updates/<version>`, checks its SHA-512, and resolves with its path. A download that does not match its checksum is deleted and rejects. `cancelDownload()` stops a running download, which then rejects with `code` `ABORT_ERR`, and returns whether there was one.

## Installing

`installUpdate()` unpacks the archive next to the app, checks it, quits the app, swaps the bundle in and opens the new version with the arguments the old one had. The update is refused unless:

- the app runs from a `.app` bundle in a folder the user can write to;
- the update has the same bundle identifier;
- `codesign --verify --deep --strict` accepts it, and, when the running app is signed by a team, the update is signed by the same team.

If the swap fails the old app is put back. The promise does not settle when the install goes ahead, because the app is gone. An update is never installed on its own: call `installUpdate()` when the user agrees.

## Events

`addListener(name, listener)` returns a subscription with `remove()`.

| Event           | Payload                                                    |
| --------------- | ---------------------------------------------------------- |
| `checking`      |                                                            |
| `available`     | `{ version }`                                              |
| `not-available` |                                                            |
| `progress`      | `{ version, percent, transferred, total, bytesPerSecond }` |
| `downloaded`    | `{ version }`                                              |
| `cancelled`     |                                                            |
| `error`         | `{ message }`                                              |

Failures also reject the call that caused them.

## Limits

- Only macOS, and only zip archives. There are no delta updates.
- Update only an app that is signed and notarized for distribution: macOS applies its own checks to the new bundle when it opens.
- An app in `/Applications` that was installed by an administrator cannot be replaced by a standard user; `installUpdate()` rejects before quitting.
