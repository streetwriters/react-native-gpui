export interface PrebuiltNodeApiFixture {
  seven(): number;
  add(left: number, right: number): number;
}

// This file is the package's JS entry, so the `require()` of the prebuilt
// binary is relative and inside the package exactly as a real npm package would
// write it. The Babel plugin turns it into `requireNodeAddon(<library name>)`,
// where the library name is derived from this package's name and the binary's
// basename.
//
// The `.node` extension is left off: that is the form the Babel plugin
// recognizes by probing `<path>.node`, and autolink strips the extension when it
// derives the library name, so the two still agree. Metro resolves the path
// statically on every platform, so scripts/build-prebuilt-addon.mjs makes the
// file exist before bundling: the real addon on Linux, a placeholder elsewhere.
const addon: PrebuiltNodeApiFixture = require('../prebuilds/linux/prebuilt');

export default addon;
