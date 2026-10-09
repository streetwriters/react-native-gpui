#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Extra spec directories are the platform's own core specs. They
// are merged into the same in-memory schema, so a `NativeGpuiDesktop.ts` here
// produces the `NativeGpuiDesktopCxxSpec` base class next to RN's own modules.
const [reactNativeRoot, outputDir, ...extraSpecDirs] = process.argv.slice(2);
if (!reactNativeRoot || !outputDir) {
  throw new Error(
    'usage: generate-fbreactnativespec.cjs <react-native-root> <output-dir> [extra-spec-dir ...]',
  );
}
const reactNativeDir = path.resolve(reactNativeRoot);

const packageRoot = path.resolve(__dirname, '../../..');
const platformPackage = require(path.join(packageRoot, 'package.json'));
const expectedVersion = platformPackage.peerDependencies['react-native'];
const reactNativePackage = require(path.join(reactNativeDir, 'package.json'));
if (reactNativePackage.version !== expectedVersion) {
  throw new Error(
    `React Native ${reactNativePackage.version} is installed; this generated GPUI spec is pinned to ${expectedVersion}. Update the pin and verify the generated C++ before continuing.`,
  );
}

const codegenUtils = require(
  path.join(reactNativeDir, 'scripts/codegen/codegen-utils.js'),
);
const executor = require(
  path.join(reactNativeDir, 'scripts/codegen/generate-specs-cli-executor.js'),
);
const schema = codegenUtils
  .getCombineJSToSchema()
  .combineSchemasInFileList(
    [
      path.join(reactNativeDir, 'src'),
      ...extraSpecDirs.map(dir => path.resolve(dir)),
    ],
    'android',
  );

const generatedDir = path.resolve(outputDir);
fs.rmSync(generatedDir, { recursive: true, force: true });
fs.mkdirSync(generatedDir, { recursive: true });
executor.generateSpecFromInMemorySchema(
  'android',
  schema,
  generatedDir,
  'FBReactNativeSpec',
  'com.facebook.fbreact.specs',
  'all',
  false,
);
