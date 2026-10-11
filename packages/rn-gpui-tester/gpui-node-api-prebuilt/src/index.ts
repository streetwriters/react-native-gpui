export interface PrebuiltNodeApiFixture {
  seven(): number;
  add(left: number, right: number): number;
}

// This file is the package's JS entry, so the `require()` of the prebuilt
// binary is relative and inside the package exactly as a real npm package would
// write it. The Babel plugin turns it into `requireNodeAddon(<library name>)`,
// where the library name is derived from this package's name and the binary's
// basename. run-e2e.mjs compiles the binary into this path first.
//
// The `.node` extension is left off: that is the form the Babel plugin
// recognizes by probing `<path>.node`, and autolink strips the extension when it
// derives the library name, so the two still agree. Metro also needs to resolve
// the path statically, so rather than choose by `process.arch` (which fails the
// bundle on the missing branch) the package names the one file it ships; the
// autolink discovery checks the ELF machine and skips the other
// architectures' directories.
const addon: PrebuiltNodeApiFixture = require('../prebuilds/linux-x64/prebuilt');

export default addon;
