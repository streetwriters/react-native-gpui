# @react-native-gpui/hermes

The pinned [Hermes](https://github.com/facebook/hermes) engine for
react-native-gpui, packaged the way React Native ships its own engine: the
public headers we compile against, plus the prebuilt VM and `hermesc` compiler
for every platform we support.

Everything here is built from one commit, recorded in `package.json`:

```json
"hermes": {
  "repository": "https://github.com/facebook/hermes",
  "commit": "10a40b5f1de81d007cba6afe567c4ba7a0b45f5d"
}
```

## Layout

| Path                          | Contents                                                       |
| ----------------------------- | -------------------------------------------------------------- |
| `include/`, `public/`, `API/` | The upstream headers at the pinned commit, byte for byte       |
| `bin/<platform>-<arch>/`      | The prebuilt VM and compiler (not committed; fetched or built) |
| `scripts/fetch-binaries.mjs`  | Downloads a CI artifact or release into `bin/` and verifies it |

`bin/` is gitignored, so a fresh clone has the headers but no binaries:

| Platform                     | Files                                         |
| ---------------------------- | --------------------------------------------- |
| `darwin-arm64`, `darwin-x64` | `libhermesvm.dylib`, `hermesc`                |
| `linux-x64`, `linux-arm64`   | `libhermesvm.so`, `hermesc`                   |
| `win32-x64`, `win32-arm64`   | `hermesvm.dll`, `hermesvm.lib`, `hermesc.exe` |

## Fetching the binaries

```sh
# latest successful hermes-engine workflow run (needs an authenticated gh)
npm run fetch-binaries

# a specific run, a release tag, or an artifact you downloaded by hand
node scripts/fetch-binaries.mjs --run 123456789
node scripts/fetch-binaries.mjs --tag hermes-10a40b5
node scripts/fetch-binaries.mjs --from ~/Downloads/hermes-darwin-arm64.zip

# check what is present: the host platform, or every platform
npm run verify-binaries
node scripts/fetch-binaries.mjs --verify --all
```

## Building it yourself

`.github/workflows/hermes-engine.yml` builds all six targets and uploads one
artifact per platform. The same builds run locally through the repo scripts:

```sh
scripts/build-hermes-macos.sh      # builds universal, then lipo -thin per arch
scripts/build-hermes-linux.sh      # linux-x64
scripts/build-hermes-windows.ps1   # win32-x64, run from a Developer PowerShell
```

Each script expects a facebook/hermes checkout at the pinned commit (override
with `RN_GPUI_HERMES_SOURCE_DIR`) and warns when its HEAD does not match.

The build flags are mirrored from `package.json`'s `hermes.buildFlags`:

```
HERMES_ENABLE_NAPI=ON
HERMES_ENABLE_DEBUGGER=ON
HERMES_ENABLE_INTL=ON
HERMES_ENABLE_TEST_SUITE=OFF
HERMES_BUILD_APPLE_FRAMEWORK=OFF
```

### Intl

`HERMES_ENABLE_INTL=ON` exposes `Intl.Collator`, `Intl.NumberFormat` and
`Intl.DateTimeFormat` (plus `Intl.getCanonicalLocales` and the `toLocale*` /
`localeCompare` prototype methods). Upstream has no single backend for this
(`lib/Platform/Intl/CMakeLists.txt`), so each platform resolves Intl
differently:

- **Apple** — Foundation (`NSLocale`, `NSDateFormatter`, …). No ICU involved.
- **Linux** — the system ICU, so `libicu-dev` (ICU 65 or newer) is required to
  build and the resulting `libhermesvm.so` links `libicuuc` / `libicui18n` at
  runtime. Build with `-DHERMES_USE_STATIC_ICU=ON` for a self-contained library.
- **Windows** — the ICU that ships with Windows 10 1703 and later, through
  `HERMES_ENABLE_WIN10_ICU_FALLBACK` (the default). No extra artifacts needed.

ICU is linked on Windows and Linux even with Intl off, because the
non-Apple/Android Unicode backend uses it as well. Apple builds link only
CoreFoundation.
