---
id: publishing-desktop
title: Publishing your app
---

`package-desktop` turns your app into an installable package for the operating system you run it on. It always builds a release.

```shell
npx react-native package-desktop                 # every format this OS can build
npx react-native package-desktop --target dmg    # one format
```

The output goes to `desktop/build/dist/`. Use `--out <dir>` to choose another folder.

## Formats

| OS      | Formats                    | `--target` values |
| ------- | -------------------------- | ----------------- |
| macOS   | `.app` and `.dmg`          | `app`, `dmg`      |
| Windows | An NSIS installer (`.exe`) | `nsis`            |
| Linux   | `.deb` and `.AppImage`     | `deb`, `appimage` |

`--target` takes a comma-separated list. An app is packaged for the operating system you build on, so build the Windows installer on Windows and the Linux packages on Linux. The formats can also be set in [`bundle.targets`](desktop-json#bundle).

## Describing the app

The name, identifier, icon, version and window of the app come from [`desktop.json`](desktop-json). Add per-OS files such as `desktop.windows.json` for settings that only apply to one operating system.

## Signing

Signing is read from the environment, never from `desktop.json`, so certificates stay out of your repository.

### macOS

The app is ad-hoc signed, which is enough to run it on your own Mac. To sign with your own certificate, set:

| Variable                     | Description                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `APPLE_SIGNING_IDENTITY`     | The identity to sign with.                                       |
| `APPLE_CERTIFICATE`          | The certificate.                                                 |
| `APPLE_CERTIFICATE_PASSWORD` | The certificate's password.                                      |
| `APPLE_ID`, `APPLE_PASSWORD` | Your Apple ID and an app-specific password, to notarize the app. |

### Windows

The installer is unsigned unless `WINDOWS_CERTIFICATE_THUMBPRINT` is set to the thumbprint of the signing certificate.

## After packaging

Packaging relinks the release binary without absolute runtime paths. As a result, `desktop/build/target/release/<app>` stops running from the checkout until `run-desktop --release` builds it again.

## The C++ runtime on Windows

The engine and the React Native runtime are C++ libraries that pass strings, shared pointers and exceptions between each other and the executable, so they all use one shared copy of the Visual C++ runtime. `package-desktop` finds the runtime DLLs (`vcruntime140.dll`, `msvcp140.dll` and the others in the Visual Studio `Microsoft.VC143.CRT` folder) and puts them next to the executable in the installer. A machine without the Visual C++ Redistributable runs the installed app. The Windows Universal CRT is part of Windows 10 and later.

Electron [ships the runtime the same way](https://github.com/electron/electron/pull/9764). Tauri links the runtime into its Rust executable statically (the `static_vcruntime` crate), which works because that executable has no C++ libraries beside it that share objects with it.
