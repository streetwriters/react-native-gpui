# GPUI pin

We build on the `streetwriters/gpui-fast` fork: GPUI extracted from the Zed
monorepo, with a retained-mode layout engine (unchanged views are replayed,
layout nodes reused). It keeps upstream GPUI's API; fork code lives in `fast/`
dirs with small hooks. Experimental, git-only (no crates.io releases or tags),
so we pin by commit SHA and bump on purpose.

## Pinned

- Repository: https://github.com/streetwriters/gpui-fast
- Branch: `rn-gpui-linux` (tracks upstream `main`; Linux fixes are commits on
  top so each one can become an upstream pull request)
- Commit: `6f5c836913c3b5b7ddf930c88259447799c887d1` (upstream main @ 2026-10-09,
  "ci: allow release dependency tests time to compile on Windows (#53)", plus
  the Linux fixes below)
- Pinned in: `Cargo.toml` `[workspace.dependencies] gpui.rev`

## Carried patches on top of upstream

- `bb9bd86` `gpui: map X11 windows only when shown` (honour `show: false`)
- `40aff79` `gpui_linux: apply resizes to unmapped X11 windows`
- `5a547b9` `gpui_linux: log a missing XInput pointer as a warning`
- `a161424` `gpui_linux: implement render_to_image for X11 and Wayland`
- `75603f3` `gpui: expose accessibility identifiers and states in the debug tree`
- `6f5c836` `gpui_linux: track the X11 map state from map and unmap events`

## Upstream (from the repo's `UPSTREAM` file at that commit)

- Zed repository: https://github.com/zed-industries/zed
- Zed commit: `a1b71072e5b43faef437b471e988fbb5f972c99c`
- gpui-fast import commit holding that import unchanged:
  `8848cdcf22eb7479a07a17d8ca627dc8144e4f38` (branch `sync/zed-a1b7107`,
  merged as gpui-fast#38)

`git show <import_commit>:<path>` in gpui-fast gives upstream's version of a
tracked path without a Zed checkout.

## Policy

- `rn-gpui` uses only upstream GPUI APIs. gpui-fast promises that upstream code
  compiles against its fork unchanged.
- Until gpui-fast lands window composition (zed#62379), carry that patch on our
  own branch of gpui-fast if we need it (design doc §5).
- Bump the SHA deliberately; record the new SHA + UPSTREAM Zed commit here.
