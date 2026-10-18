// Builds the tester's Node-API fixture the way a third-party package builds
// one: a plain compiler command against the NAPI headers, no CMake and no link
// against the engine's *code*.
//
// On macOS and Linux the addon's `napi_*` symbols stay undefined in the file and
// resolve against whatever is already loaded in the process (libhermesvm), which
// is what a stock `.node` file from npm does.
//
// Windows cannot express that: an import names the DLL it comes from, so the
// fixture is built the way node-gyp builds one there — against an import library
// whose *name* is `node.exe`, with `/DELAYLOAD:node.exe` and node-gyp's
// delay-load hook compiled in. That hook replaces the `node.exe` load with the
// current process image at run time, which is exactly how a stock node-gyp addon
// finds the host's Node-API. The import library is generated from the engine's
// published export list, so the fixture imports the same names the app forwards.
//
// Output goes to node-addon-fixture/build/addon.node, which is gitignored.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = path.join(projectRoot, 'node-addon-fixture');
const source = path.join(fixture, 'addon.c');
const output = path.join(fixture, 'build/addon.node');

const headers = path.resolve(projectRoot, '../hermes/include/hermes/napi');
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

if (process.platform === 'win32') {
  buildWithMsvc();
} else {
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
}
console.log(`built Node-API fixture at ${output}`);

/**
 * The node-gyp shape on Windows.
 *
 * `lib /def` turns the engine's export list into an import library named
 * `node.exe`, which is the provider name a node-gyp addon declares. `/DELAYLOAD`
 * makes those imports resolve lazily, and the vendored hook supplies the running
 * process image when the loader would otherwise look for `node.exe` on disk —
 * without the hook the addon cannot load in a host that is not named node.exe.
 */
function buildWithMsvc() {
  const buildDir = path.join(fixture, 'build');
  const exportsList = path.resolve(
    projectRoot,
    '../hermes/desktop/node-api-exports.txt',
  );
  if (!fs.existsSync(exportsList)) {
    throw new Error(`Node-API export list not found at ${exportsList}`);
  }
  const def = path.join(buildDir, 'node.def');
  const names = fs
    .readFileSync(exportsList, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  fs.writeFileSync(
    def,
    `LIBRARY node.exe\nEXPORTS\n${names.map(name => `  ${name}\n`).join('')}`,
  );

  const machine = process.arch === 'arm64' ? 'arm64' : 'x64';
  const nodeLib = path.join(buildDir, 'node.lib');
  execFileSync(
    'lib',
    [`/def:${def}`, `/name:node.exe`, `/machine:${machine}`, `/out:${nodeLib}`],
    {
      stdio: 'inherit',
    },
  );

  const hook = path.join(fixture, 'win_delay_load_hook.cc');
  execFileSync(
    'cl',
    [
      '/nologo',
      '/LD',
      '/EHsc',
      '/I',
      headers,
      source,
      hook,
      `/Fe:${output}`,
      '/link',
      `/DELAYLOAD:node.exe`,
      'delayimp.lib',
      nodeLib,
    ],
    { stdio: 'inherit' },
  );
}
