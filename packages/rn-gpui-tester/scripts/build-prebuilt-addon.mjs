// Compiles the prebuilt Node-API fixture the way an external package author
// would: a plain `cc -shared` against the NAPI headers, with no weak-node-api
// and no CMake. run-e2e.mjs calls this before bundling so the fixture's
// `require('.../prebuilt.node')` exists when Metro's Babel plugin rewrites it.
//
// The output always lands at prebuilds/linux-x64/prebuilt.node because the
// package's JS entry requires that path literally: Metro resolves a `require`
// statically, so the fixture ships one file rather than a per-architecture
// branch. The autolink discovery still checks the ELF machine and would skip a
// directory for another architecture.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const archiveRoot = path.resolve(projectRoot, '../@react-native-gpui/hermes');
const headers = path.join(archiveRoot, 'include/hermes/napi');
if (!fs.existsSync(path.join(headers, 'node_api.h'))) {
  throw new Error(`NAPI headers not found at ${headers}`);
}

const fixture = path.join(projectRoot, 'gpui-node-api-prebuilt');
const output = path.join(fixture, 'prebuilds/linux-x64/prebuilt.node');
fs.mkdirSync(path.dirname(output), { recursive: true });

execFileSync(
  process.env.CC || 'cc',
  [
    '-shared',
    '-fPIC',
    '-I',
    headers,
    path.join(fixture, 'addon.c'),
    '-o',
    output,
  ],
  { stdio: 'inherit' },
);
console.log(`[e2e] built prebuilt Node-API fixture at ${output}`);
