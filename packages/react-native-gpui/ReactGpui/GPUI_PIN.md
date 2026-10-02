# GPUI pin

We build on the Longbridge `gpui-fast` fork: GPUI extracted from the Zed
monorepo, with a retained-mode layout engine (unchanged views are replayed,
layout nodes reused). It keeps upstream GPUI's API; fork code lives in `fast/`
dirs with small hooks. Experimental, git-only (no crates.io releases or tags),
so we pin by commit SHA and bump on purpose.

## Pinned

- Repository: https://github.com/longbridge/gpui-fast
- Commit: `92a9b0f7041c8701d4aef4c05534a603caff75d3` (main @ 2026-10-01,
  "chore: Build fast::interactivity in release again (#34)")
- Pinned in: `Cargo.toml` `[workspace.dependencies] gpui.rev`

## Upstream (from the repo's `UPSTREAM` file at that commit)

- Zed repository: https://github.com/zed-industries/zed
- Zed commit: `0bdc70c2ebfb3f75c597f04f3e9540f992c86626`
- gpui-fast import commit holding that import unchanged:
  `0d78d7736e746d9a012ab4a53c3f4e99b64a750e` (branch `upstream/zed-0bdc70c`)

`git show <import_commit>:<path>` in gpui-fast gives upstream's version of a
tracked path without a Zed checkout.

## Policy

- `rn-gpui` uses only upstream GPUI APIs. gpui-fast promises that upstream code
  compiles against its fork unchanged.
- Until gpui-fast lands window composition (zed#62379), carry that patch on our
  own branch of gpui-fast if we need it (design doc §5).
- Bump the SHA deliberately; record the new SHA + UPSTREAM Zed commit here.
