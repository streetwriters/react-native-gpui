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
| `API/`, `public/`, `include/` | The upstream headers we compile against, byte for byte (below) |
| `bin/<platform>-<arch>/`      | The prebuilt VM and compiler (not committed; fetched or built) |
| `scripts/fetch-binaries.mjs`  | Downloads a CI artifact or release into `bin/` and verifies it |

Only the headers needed to compile against the VM are vendored. Everything
else in upstream `include/` is VM internals the shared library does not export.

- `API/{hermes,jsi,napi,hermes_abi}/**/*.h`: every upstream header in those
  folders (`hermes.h`, the debugger and CDP headers React Native's inspector
  uses, `hermes_napi.h`, JSI and the Hermes ABI). Sources and tooling under
  `API/` and the unused `API/hermes_sandbox` are not vendored.
- `public/hermes/Public/*.h`: config and export headers that `hermes.h`
  includes.
- `include/hermes/napi/`: the Node-API C headers that `hermes_napi.h`
  includes, with upstream's `VENDORED.md`.

The build compiles against React Native's JSI (`ReactCommon/jsi`); `API/jsi`
is kept only so the API folder matches upstream.

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
HERMES_ENABLE_INTL=ON    # Apple only; OFF on Linux and Windows
HERMES_ICU_RUNTIME_LOAD=ON    # Linux only; other platforms build without it
HERMES_ENABLE_TEST_SUITE=OFF
HERMES_BUILD_APPLE_FRAMEWORK=OFF
```

### Intl

`HERMES_ENABLE_INTL=ON` exposes `Intl.Collator`, `Intl.NumberFormat` and
`Intl.DateTimeFormat` (plus `Intl.getCanonicalLocales` and the `toLocale*` /
`localeCompare` prototype methods). It is enabled on Apple only for now:

- **Apple**: Foundation (`NSLocale`, `NSDateFormatter`, …). No ICU involved and
  nothing extra ships.
- **Windows and Linux**: off. Upstream's backend for these platforms
  (`lib/Platform/Intl/PlatformIntlICU.cpp`) needs ICU's C++ API, which the ICU
  built into Windows does not expose, and its `NumberFormat` is a stub
  (`std::to_string`). Bundling ICU would add about 30 MB. Intl comes back once
  Hermes has a backend that loads the OS's ICU at runtime.

ICU is still used with Intl off, because the non-Apple/Android Unicode backend
needs it for case conversion, `localeCompare`, `normalize` and
`toLocaleDateString`. Windows links the OS ICU; Linux resolves whichever
`libicui18n.so.N` the system has with `dlopen` at first use (see
`patches/0001-linux-load-icu-at-runtime.patch` of the react-native-gpui
repository this package is built from). Without a system ICU on Linux the VM
keeps working with ASCII-only case mapping, code-unit collation and no-op
normalization. Apple builds link only CoreFoundation.
