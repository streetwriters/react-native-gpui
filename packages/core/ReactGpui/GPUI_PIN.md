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
- Commit: `c380367` (`rn-gpui-linux`, 2026-10-19: the carried patches below plus
  the startup deferrals)
- Pinned in: `Cargo.toml` `[workspace.dependencies] gpui.rev`

## Startup deferrals

- `c380367` `gpui_macos: defer work the first frame does not read`
  - `MacKeyboardLayout::new` runs on first key use rather than at platform
    creation. It cost about 30 ms — `platform created` fell from 43 ms to 12 ms
    once it was lazy, and nothing in the first frame reads a keyboard layout.
  - `NSWindow.setAllowsAutomaticWindowTabbing(false)` is set once at platform
    start instead of per window, so `NSWindow.tabGroup` is nil from the outset
    and `tab_bar_visible` answers without asking AppKit. A window that asks for
    a tabbing identifier re-enables it in its own initialiser.

## Carried patches on top of upstream

- `7338a98` `gpui: map X11 windows only when shown` (honour `show: false`)
- `2895a8f` `gpui_linux: apply resizes to unmapped X11 windows`
- `09a45a7` `gpui_linux: log a missing XInput pointer as a warning`
- `8034d63` `gpui_linux: implement render_to_image for X11 and Wayland`
- `f8edd01` `gpui: expose accessibility identifiers and states in the debug tree`
- `f1abf86` `gpui_linux: track the X11 map state from map and unmap events`
- `1db8564` `gpui_windows: deliver hover callbacks outside the window procedure`
  — the commit message says "hover and resize", but only hover is deferred in it:
  `WM_SIZE` and `WM_MOVE` still invoked their callbacks inline, so the earlier
  pin compensated in shared `window.rs` instead. `172d79f` finishes the job in
  the backend and that compensation is gone.
- `8e846d2` `gpui_windows: skip windows that are already gone`
- `ebf3ced` `gpui: ignore platform callbacks for a window that has been removed`
  — amended in effect by `394557f`: that commit made five callbacks discard their
  `update` result, which also silenced a failed `App` borrow. The removed-window
  case is now a typed `WindowRemoved` error that only that case ignores; every
  other failure is logged again.
- `172d79f` `gpui_windows: defer resize and move out of the window procedure`
- `394557f` `gpui: log a failed borrow in the platform callbacks again`
- `ffc9655` `gpui: defer the move callback so a synchronous move cannot re-enter
App` — a move performed from inside an `App` update (a JS `set_position`,
  which AppKit implements with `setFrameTopLeftPoint:`) is notified before that
  call returns, so `on_moved` ran `handle.update` while the caller still held
  the `App` and logged `ERROR gpui::window] RefCell already borrowed`. It now
  defers through the foreground executor, as `on_appearance_changed` already
  does. macOS-only in practice, but the callback is shared, so Windows and Linux
  re-run their window tests against this pin.

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

## Known limitation: retained views under accessibility

The retained-view fast path is disabled while a screen reader is active:

- `crates/gpui/src/fast/retained.rs:544` (`self.a11y.is_active()`)
- `crates/gpui/src/fast/splice.rs:297` (`self.a11y.is_active()`)
- `crates/gpui/src/fast/layers/mod.rs:121` (`!window.a11y.is_active()`)

With it disabled, a visible window rebuilds its element tree on every refresh,
so the `retained static siblings do not render with changing siblings` e2e check
expects 5 recorded paints but sees every subsequent paint as well. Hidden
(offscreen) windows do not refresh from events, which is why the offscreen e2e
runs pass with the accessibility bus on.

Because of that, the Linux e2e runner leaves the AT-SPI bus off for **headed**
runs (`packages/rn-gpui-tester/scripts/run-e2e.mjs`), so the native
accessibility assertions skip there. Offscreen runs still enable the bus.
Setting `RN_GPUI_TEST_NATIVE_A11Y=1` forces the bus on even when headed.

Windows is not affected, and needs no equivalent rule. Activation there is
per process: `gpui_windows` only starts publishing when a client asks the window
for its accessibility provider (`WM_GETOBJECT`), and the test driver asks on
behalf of the assertions, so only the process running an accessibility test has
`a11y.is_active()` set. A headed run was measured with accessibility active and
the `retained static siblings` check passed; each test launches its own app
process, so the activation cannot leak between them.

Fixing this properly means replaying accessibility subtree updates for retained
views; that is out of scope for now.
