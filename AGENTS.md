# AGENTS.md

A change is one unit of work: a feature, a fix, a refactor. It can span several commits or a whole PR.

## Commits

- One-line Conventional Commits subject. Add a brief body only when the subject is not enough.
- No attribution lines (`Co-Authored-By` or similar).

## Every change

- Add an entry to the `CHANGELOG.md` of each package it touches, under `## Unreleased`. Keep changelogs current; a release renames `Unreleased` to the version, and that section becomes the GitHub release notes.
- Update the docs in `docs/` when behaviour, APIs or setup change.
- Find the simplest solution, and verify it before calling it done.

## Versions

- `cli`, `codegen`, `core`, `hermes`, `testing`: `0.<react-native minor>.<patch>[-alpha.N]`, with a `react-native` peer of `0.<minor>.x`.
- Dependencies between our packages use the exact version.

## Code

- Few comments, technical only. No references to plans, tickets or history.
- No unnecessary tests, and none for project files such as CI or scripts. Use temporary test files while implementing, and never commit or push them.

## Packages

- react-native-gpui contains no modules. Every module, our own or an adapter for a third-party library, lives in [react-native-gpui-modules](https://github.com/streetwriters/react-native-gpui-modules).
- Every package has a human-readable `README.md`, a `LICENSE` and a `CHANGELOG.md`, with `license`, `repository` and `description` set in its `package.json`.

## The gpui pin

- gpui-fast is pinned by revision in `packages/core/ReactGpui/Cargo.toml` (`[workspace.dependencies] gpui.rev`) and described in `packages/core/ReactGpui/GPUI_PIN.md`.
- [react-native-gpui-modules](https://github.com/streetwriters/react-native-gpui-modules) builds against the same revision: autolink writes it into the `[patch.crates-io]` block of the modules' example app and of each module crate that is its own workspace root. When the pin changes here, change it there in the same sitting: bump the core packages the modules use, run `npm run autolink` in its `example` and `npm run test:rust`, and commit the manifests they rewrite.

## Pull requests

- Keep the body short and unwrapped. Say what was implemented and what changed: what it adds, fixes or breaks. Don't list files or code references.
- For performance work, add a before/after table.
