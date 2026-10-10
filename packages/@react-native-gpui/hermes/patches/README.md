# Hermes patches

Patches carried on top of the pinned `facebook/hermes` commit
(`10a40b5f1de81d007cba6afe567c4ba7a0b45f5d`; see `hermes.commit` in
`package.json`). `scripts/build-hermes-*.sh` and the `hermes-engine` workflow
apply every `patches/*.patch` to the Hermes checkout before configuring it.

## 0001-linux-load-icu-at-runtime.patch

Hermes links the build machine's ICU into `libhermesvm.so`, and ICU puts its
major version in every file and symbol name, so the library only loads on
systems that have that exact ICU version (the published Linux binaries need
`libicuuc.so.74`, for example). The patch adds the CMake option
`HERMES_ICU_RUNTIME_LOAD` (Linux only; incompatible with
`HERMES_ENABLE_INTL=ON`) that drops the link and resolves the fifteen ICU
entry points Hermes uses with `dlopen`/`dlsym` at first use, trying
`libicui18n.so.100` down to `libicui18n.so.50`. Without any system ICU the
Unicode fallbacks (ASCII-only case mapping, code-unit collation, no-op
normalization, C-locale dates) keep the VM working. `HERMES_ICU_VERSION`
forces a single version, with `0` disabling loading entirely, so tests can
exercise the fallback.

Regenerate it from a Hermes worktree at the pinned commit:

```sh
git -C <hermes checkout> worktree add /tmp/hermes-patch 10a40b5f1d
cd /tmp/hermes-patch          # make the changes
git add -A
git diff --cached --binary 10a40b5f1d > /path/to/patches/0001-linux-load-icu-at-runtime.patch
```
