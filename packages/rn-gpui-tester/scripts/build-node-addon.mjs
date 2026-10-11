// Builds the tester's Node-API fixture the way a third-party package builds
// one: a plain `cc` command against the NAPI headers, no CMake and no link
// against the engine. That is the whole point of the fixture now — the addon's
// `napi_*` symbols stay undefined in the file and resolve against whatever is
// already loaded in the process (libhermesvm), which is what a stock `.node`
// file from npm does.
//
// Output goes to node-addon-fixture/build/addon.node, which is gitignored. On
// Windows nothing is written and the script exits 0: addon.c uses pthreads, and
// Windows is covered by real npm packages instead (Part W).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = path.join(projectRoot, 'node-addon-fixture');
const source = path.join(fixture, 'addon.c');
const output = path.join(fixture, 'build/addon.node');

if (process.platform === 'win32') {
  process.exit(0);
}

const headers = path.resolve(
  projectRoot,
  '../@react-native-gpui/hermes/include/hermes/napi',
);
if (!fs.existsSync(path.join(headers, 'node_api.h'))) {
  throw new Error(`NAPI headers not found at ${headers}`);
}

if (
  fs.existsSync(output) &&
  fs.statSync(output).size > 0 &&
  fs.statSync(output).mtimeMs >= fs.statSync(source).mtimeMs
) {
  process.exit(0);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
const cc = process.env.CC || 'cc';
// `-undefined dynamic_lookup` is macOS's spelling of "leave the undefined
// symbols for the loader", which is what node-gyp passes for a bundle.
const args =
  process.platform === 'darwin'
    ? [
        '-bundle',
        '-undefined',
        'dynamic_lookup',
        '-I',
        headers,
        source,
        '-o',
        output,
      ]
    : ['-shared', '-fPIC', '-I', headers, source, '-o', output, '-lpthread'];
execFileSync(cc, args, { stdio: 'inherit' });
console.log(`built Node-API fixture at ${output}`);
