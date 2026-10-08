// Hermes tooling hooks for the GPUI CLI (plan item 7.14 step 5).
//
// The CLI loads this module when Hermes is the active engine. Nothing in core or
// the CLI knows about `hermesc`: the compiler path, the Metro transform profile
// and the shipping file name are all declared here.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

const PLATFORM_DIRECTORIES = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'win32-x64': 'win32-x64',
  'win32-arm64': 'win32-arm64',
};

function compilerPath() {
  const directory = PLATFORM_DIRECTORIES[`${process.platform}-${process.arch}`];
  if (!directory) {
    throw new Error(
      `@react-native-gpui/hermes has no compiler for ${process.platform}-${process.arch}`,
    );
  }
  const executable = process.platform === 'win32' ? 'hermesc.exe' : 'hermesc';
  const candidate = path.join(PACKAGE_ROOT, 'bin', directory, executable);
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `hermesc not found at ${candidate}. Install the compiler with ` +
        '`npm run fetch-binaries --workspace @react-native-gpui/hermes`.',
    );
  }
  return candidate;
}

module.exports = {
  // Hermes bytecode is not source, so the transform must emit the profile the
  // Hermes parser and optimizer expect.
  metroConfig: () => ({
    transformer: { unstable_transformProfile: 'hermes-stable' },
  }),

  // What the runtime loads after `compile`.
  bundleExtension: '.hbc',

  /**
   * Turns a Metro bundle into Hermes bytecode.
   * `{ input, output, sourcemapInput, sourcemapOutput, dev }` -> `{ output }`.
   * Release builds are optimized; development builds stay unoptimized so the
   * output is closer to the source for debugging.
   */
  compile: ({ input, output, sourcemapInput, sourcemapOutput, dev }) => {
    const args = ['-emit-binary', '-out', output];
    if (!dev) args.push('-O');
    if (sourcemapInput) args.push('-source-map', sourcemapInput);
    if (sourcemapOutput) args.push('-output-source-map', sourcemapOutput);
    args.push(input);
    execFileSync(compilerPath(), args, { stdio: 'inherit' });
    return { output };
  },
};
