// Makes the prebuilt Node-API fixture's binary exist before Metro runs. The
// fixture's JS entry requires `prebuilds/linux/prebuilt.node` literally, and
// Metro resolves a `require` statically, so the file has to be there on every
// platform or the whole tester bundle fails to build.
//
// On Linux it is compiled the way an external package author would: a plain
// `cc -shared` against the NAPI headers, with no weak-node-api and no CMake.
// The directory carries no architecture, so the same path works on x64 and
// arm64; autolink tells them apart by the ELF header.
//
// Elsewhere an empty placeholder is written. The Babel plugin treats any
// existing `.node` file as an addon and rewrites the `require`, which is all
// the bundle needs; the screen that loads it only runs in the Linux e2e test.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = path.join(projectRoot, 'gpui-node-api-prebuilt');
const output = path.join(fixture, 'prebuilds/linux/prebuilt.node');
fs.mkdirSync(path.dirname(output), { recursive: true });

if (process.platform !== 'linux') {
  if (!fs.existsSync(output)) fs.writeFileSync(output, '');
  process.exit(0);
}

const headers = path.resolve(
  projectRoot,
  '../@react-native-gpui/hermes/include/hermes/napi',
);
if (!fs.existsSync(path.join(headers, 'node_api.h'))) {
  throw new Error(`NAPI headers not found at ${headers}`);
}
const source = path.join(fixture, 'addon.c');
if (
  fs.existsSync(output) &&
  fs.statSync(output).size > 0 &&
  fs.statSync(output).mtimeMs >= fs.statSync(source).mtimeMs
) {
  process.exit(0);
}
execFileSync(
  process.env.CC || 'cc',
  ['-shared', '-fPIC', '-I', headers, source, '-o', output],
  { stdio: 'inherit' },
);
console.log(`built prebuilt Node-API fixture at ${output}`);
