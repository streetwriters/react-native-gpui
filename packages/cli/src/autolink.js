import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// npm ships npx as a .cmd shim on Windows, where child_process cannot resolve a
// command without its extension, and Node refuses to spawn .cmd/.bat files
// without a shell (the CVE-2024-27980 fix), so npx runs through the shell
// there. A shell joins the arguments into one command line, so arguments with
// spaces are quoted here first.
export const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
export const npxShell = process.platform === 'win32';
export const npxArgs = args =>
  npxShell ? args.map(arg => (/\s/u.test(arg) ? `"${arg}"` : arg)) : args;

/**
 * Write a generated file only when its content differs. Cargo and CMake go by
 * modification time, so rewriting an identical file makes every launch rebuild
 * the C++ bridge and each crate that depends on it.
 */
function writeIfChanged(file, contents) {
  try {
    if (fs.readFileSync(file, 'utf8') === contents) return;
  } catch {}
  fs.writeFileSync(file, contents);
}

const findCppSources = directory => {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findCppSources(entryPath);
    return /\.(?:cc|cpp|cxx)$/u.test(entry.name) ? [entryPath] : [];
  });
};

const cppIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const includePath = /^[A-Za-z0-9_./+-]+$/u;
const jsEngineName = /^[a-z][a-z0-9-]*$/u;
const prebuiltModes = ['auto', 'always', 'never'];

/**
 * Reads the app's `project.gpui.prebuilt` option: `auto` uses the pinned
 * prebuilt C++ runtime when it matches and builds from source otherwise,
 * `always` fails the build instead of falling back, `never` builds from source.
 */
function prebuiltModeFor(project) {
  const prebuilt = project?.prebuilt ?? 'auto';
  if (!prebuiltModes.includes(prebuilt)) {
    throw new Error(
      `project.gpui.prebuilt must be one of ${prebuiltModes.map(mode => `'${mode}'`).join(', ')}`,
    );
  }
  return prebuilt;
}

/**
 * Validates a dependency's `platforms.gpui.jsEngine` entry. Installing a
 * package that declares one is how an app opts into an engine; the entry names
 * the C registration symbol core calls at startup and the optional JS tooling
 * hooks the CLI uses.
 */
function jsEngineConfigFor(dependencyName, packageRoot, jsEngine) {
  if (
    typeof jsEngine !== 'object' ||
    jsEngine === null ||
    Array.isArray(jsEngine)
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.jsEngine must be an object`,
    );
  }
  const {
    name,
    register,
    bundle,
    runtimeFiles,
    nodeApiExports,
    nodeApiLibrary,
  } = jsEngine;
  if (typeof name !== 'string' || !jsEngineName.test(name)) {
    throw new Error(
      `${dependencyName}: platforms.gpui.jsEngine.name must be a lowercase engine name (${jsEngineName})`,
    );
  }
  if (typeof register !== 'string' || !cppIdentifier.test(register)) {
    throw new Error(
      `${dependencyName}: platforms.gpui.jsEngine.register must be a C identifier`,
    );
  }
  const resolveHook = (key, value) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `${dependencyName}: platforms.gpui.jsEngine.${key} must be a path`,
      );
    }
    const resolved = path.resolve(packageRoot, value);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `${dependencyName}: platforms.gpui.jsEngine.${key} does not exist: ${resolved}`,
      );
    }
    return resolved;
  };
  // The Node-API export list is what the app's executable re-exports on Windows,
  // so the name has to be a plain library name: it becomes the DLL half of each
  // forwarded export (`napi_x = hermesvm.napi_x`).
  if (
    nodeApiExports !== undefined &&
    (typeof nodeApiLibrary !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(nodeApiLibrary))
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.jsEngine.nodeApiLibrary must be a library name when nodeApiExports is set`,
    );
  }
  return {
    dependencyName,
    name,
    register,
    bundle: resolveHook('bundle', bundle),
    runtimeFiles: resolveHook('runtimeFiles', runtimeFiles),
    nodeApiExports: resolveHook('nodeApiExports', nodeApiExports),
    nodeApiLibrary: nodeApiExports === undefined ? undefined : nodeApiLibrary,
  };
}

function componentConfigFor(dependencyName, gpui) {
  const descriptors = gpui.componentDescriptors ?? [];
  const headers = gpui.componentHeaders ?? [];
  const sources = gpui.componentSources ?? [];
  const includeDirs = gpui.componentIncludeDirs ?? [];
  const sourcePackage = gpui.componentSourcePackage;
  if (
    !Array.isArray(descriptors) ||
    !descriptors.every(
      value => typeof value === 'string' && cppIdentifier.test(value),
    )
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.componentDescriptors must be an array of C++ identifiers`,
    );
  }
  if (
    !Array.isArray(headers) ||
    !headers.every(
      value =>
        typeof value === 'string' &&
        includePath.test(value) &&
        value.endsWith('.h'),
    )
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.componentHeaders must be an array of C++ header paths`,
    );
  }
  if (headers.some(value => value.split('/').includes('..'))) {
    throw new Error(
      `${dependencyName}: componentHeaders must not escape the include search path`,
    );
  }
  if (descriptors.length > 0 && headers.length === 0) {
    throw new Error(
      `${dependencyName}: componentHeaders is required when componentDescriptors are declared`,
    );
  }
  if (
    !Array.isArray(sources) ||
    !sources.every(value => typeof value === 'string')
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.componentSources must be an array of source paths`,
    );
  }
  if (
    !Array.isArray(includeDirs) ||
    !includeDirs.every(value => typeof value === 'string')
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.componentIncludeDirs must be an array of paths`,
    );
  }
  if (
    sourcePackage !== undefined &&
    (typeof sourcePackage !== 'string' ||
      !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(sourcePackage))
  ) {
    throw new Error(
      `${dependencyName}: platforms.gpui.componentSourcePackage must be a package name`,
    );
  }
  return { descriptors, headers, sources, includeDirs, sourcePackage };
}

function generateComponentCodegen({
  appRequire,
  packageJson,
  packageRoot,
  dependencyName,
  gpui,
  generatedRoot,
}) {
  const componentCodegenPackage = gpui.componentCodegenPackage;
  let codegenPackageRoot = packageRoot;
  let codegenPackageJson = packageJson;
  if (componentCodegenPackage !== undefined) {
    if (
      typeof componentCodegenPackage !== 'string' ||
      !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(componentCodegenPackage)
    ) {
      throw new Error(
        `${dependencyName}: platforms.gpui.componentCodegenPackage must be a package name`,
      );
    }
    const packageJsonPath = appRequire.resolve(
      `${componentCodegenPackage}/package.json`,
    );
    codegenPackageRoot = path.dirname(packageJsonPath);
    codegenPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  }
  const codegenConfig = codegenPackageJson.codegenConfig;
  if (!codegenConfig || !['components', 'all'].includes(codegenConfig.type))
    return { sources: [], libraryName: undefined };
  const jsSrcsDir = path.resolve(
    codegenPackageRoot,
    codegenConfig.jsSrcsDir ?? '',
  );
  if (!fs.existsSync(jsSrcsDir)) {
    throw new Error(
      `${dependencyName}: Codegen source directory does not exist: ${jsSrcsDir}`,
    );
  }
  const specs = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (/\.(?:js|jsx|ts|tsx)$/u.test(entry.name)) specs.push(entryPath);
    }
  };
  visit(jsSrcsDir);
  const schema = appRequire(
    '@react-native/codegen/lib/cli/combine/combine-js-to-schema',
  ).combineSchemasInFileList(specs, 'gpui', null, codegenConfig.name);
  if (
    !Object.values(schema.modules ?? {}).some(
      module => module.type === 'Component',
    )
  )
    return { sources: [], libraryName: undefined };
  const libraryName = codegenConfig.name;
  if (
    typeof libraryName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]*$/u.test(libraryName)
  ) {
    throw new Error(
      `${dependencyName}: codegenConfig.name must be a C++ identifier for Fabric component codegen`,
    );
  }
  const codegenPackage = appRequire.resolve(
    '@react-native/codegen/package.json',
  );
  const codegenRoot = path.dirname(codegenPackage);
  const rnCodegen = appRequire(
    path.join(codegenRoot, 'lib/generators/RNCodegen.js'),
  );
  const outputDirectory = path.join(
    generatedRoot,
    libraryName,
    'react/renderer/components',
    libraryName,
  );
  const generated = rnCodegen.generate(
    {
      libraryName,
      schema,
      outputDirectory,
      packageName: packageJson.name,
      assumeNonnull: false,
    },
    {
      generators: ['descriptors', 'events', 'props', 'states', 'shadow-nodes'],
    },
  );
  if (generated !== true) {
    throw new Error(
      `${dependencyName}: React Native Codegen failed for Fabric components`,
    );
  }
  const sources = findCppSources(outputDirectory);
  return { sources, libraryName };
}

const findGeneratedFiles = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findGeneratedFiles(entryPath);
    return [entryPath];
  });
};

/**
 * Generates the C++ TurboModule specs for one package: our own spec class in
 * `<libraryName>.h` and React Native's `<libraryName>JSI.h`, which carries the
 * struct helpers for named object types.
 *
 * Codegen rewrites every file it is handed, and CMake compiles the headers'
 * dependents whenever they change, so its output is staged in a temporary
 * directory and only the files whose content differs are copied over.
 */
function generateModuleCodegen({
  appRequire,
  platformRequire,
  packageJson,
  dependencyName,
  specPaths,
  generatedRoot,
  generatedLibraries,
}) {
  const libraryName = packageJson.codegenConfig?.name;
  if (typeof libraryName !== 'string' || !cppIdentifier.test(libraryName)) {
    throw new Error(
      `${dependencyName}: codegenConfig.name is required for a C++ TurboModule`,
    );
  }
  // Two packages cannot share one codegen directory: the second would overwrite
  // the first's header.
  if (generatedLibraries.has(libraryName)) {
    throw new Error(
      `${dependencyName}: codegenConfig.name ${libraryName} is already used by ${generatedLibraries.get(libraryName)}`,
    );
  }
  generatedLibraries.set(libraryName, dependencyName);
  const schema = appRequire(
    '@react-native/codegen/lib/cli/combine/combine-js-to-schema',
  ).combineSchemasInFileList(specPaths, 'gpui', null, libraryName);
  for (const name of Object.keys(schema.modules ?? {})) {
    if (schema.modules[name].type !== 'NativeModule') {
      delete schema.modules[name];
    }
  }
  const codegenPackage = appRequire.resolve(
    '@react-native/codegen/package.json',
  );
  const codegenRoot = path.dirname(codegenPackage);
  const rnCodegen = appRequire(
    path.join(codegenRoot, 'lib/generators/RNCodegen.js'),
  );
  const outputDirectory = path.join(generatedRoot, libraryName);
  const stagingDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'rn-gpui-codegen-'),
  );
  try {
    const generated = rnCodegen.generate(
      {
        libraryName,
        schema,
        outputDirectory: stagingDirectory,
        packageName: packageJson.name,
        assumeNonnull: false,
      },
      { generators: ['modulesCxx'] },
    );
    if (generated !== true) {
      throw new Error(
        `${dependencyName}: React Native Codegen failed for the C++ TurboModule spec`,
      );
    }
    for (const file of findGeneratedFiles(stagingDirectory)) {
      const target = path.join(
        outputDirectory,
        path.relative(stagingDirectory, file),
      );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      writeIfChanged(target, fs.readFileSync(file, 'utf8'));
    }
  } finally {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
  const specPathByModule = new Map(
    specPaths.map(specPath => [
      path.basename(specPath).replace(/\.[^.]+$/u, ''),
      specPath,
    ]),
  );
  const { generateCxxSpec } = platformRequire(
    '@react-native-gpui/codegen/generate-cxx-spec',
  );
  writeIfChanged(
    path.join(outputDirectory, `${libraryName}.h`),
    generateCxxSpec({
      libraryName,
      schema,
      specPaths: Object.fromEntries(specPathByModule),
    }),
  );
  return outputDirectory;
}

export function autolink({ projectRoot = process.cwd(), configFile } = {}) {
  projectRoot = path.resolve(projectRoot);
  const desktopRoot = path.join(projectRoot, 'desktop');
  const autolinkRoot = path.join(desktopRoot, 'autolink');
  const config = JSON.parse(
    configFile
      ? fs.readFileSync(path.resolve(configFile), 'utf8')
      : execFileSync(npxCommand, npxArgs(['react-native', 'config']), {
          cwd: projectRoot,
          encoding: 'utf8',
          shell: npxShell,
        }),
  );
  const prebuilt = prebuiltModeFor(config.project?.gpui);
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  let platformPackageJson;
  try {
    platformPackageJson = appRequire.resolve(
      '@react-native-gpui/core/package.json',
    );
  } catch (error) {
    throw new Error(
      `could not resolve @react-native-gpui/core from ${projectRoot}: ${error.message}`,
    );
  }
  const platformRoot = fs.realpathSync(path.dirname(platformPackageJson));
  // The spec generator ships with the platform package, so resolve it from
  // there rather than from the app.
  const platformRequire = createRequire(platformPackageJson);
  const { TypeScriptParser } = appRequire(
    '@react-native/codegen/lib/parsers/typescript/parser',
  );
  const typescriptParser = new TypeScriptParser();
  const findSpecFiles = directory =>
    fs
      .readdirSync(directory)
      .filter(entry =>
        /^(?:Native.*|RN.*ModuleSpec)(?:\.d)?\.ts$/u.test(entry),
      );
  const moduleNameForSpec = specPath => {
    const schema = typescriptParser.parseFile(specPath);
    const modules = Object.values(schema.modules ?? {});
    if (modules.length !== 1 || modules[0].type !== 'NativeModule') {
      throw new Error(`${specPath} must define exactly one TurboModule`);
    }
    return modules[0].moduleName;
  };
  const runtimeCrate = path.join(platformRoot, 'ReactGpui/rn-gpui');
  if (!fs.existsSync(path.join(runtimeCrate, 'Cargo.toml'))) {
    throw new Error(
      `@react-native-gpui/core has no Rust crate at ${runtimeCrate}`,
    );
  }
  const rustCrates = [];
  const turboModuleSpecs = [];
  const cmakeProjects = [];
  const cppTurboModules = [];
  const appComponentDescriptors = [];
  const appComponentHeaders = [];
  const appComponentSources = [];
  const appComponentIncludeDirs = [];
  const componentNames = new Map();
  const jsEngines = [];
  const codegenRoot = path.join(autolinkRoot, 'codegen');
  const generatedLibraries = new Map();
  for (const [dependencyName, dependency] of Object.entries(
    config.dependencies ?? {},
  )) {
    const root = fs.realpathSync(
      path.resolve(
        dependency.root ??
          path.join(projectRoot, 'node_modules', dependencyName),
      ),
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    const gpui = dependency.platforms?.gpui;
    if (!gpui) continue;
    if (gpui.jsEngine !== undefined) {
      jsEngines.push(jsEngineConfigFor(dependencyName, root, gpui.jsEngine));
    }
    const componentConfig = componentConfigFor(dependencyName, gpui);
    const componentSourceRoot = componentConfig.sourcePackage
      ? path.dirname(
          appRequire.resolve(`${componentConfig.sourcePackage}/package.json`),
        )
      : root;
    for (const descriptor of componentConfig.descriptors) {
      const previousDependency = componentNames.get(descriptor);
      if (previousDependency) {
        throw new Error(
          `${dependencyName}: component descriptor ${descriptor} is already declared by ${previousDependency}`,
        );
      }
      componentNames.set(descriptor, dependencyName);
    }
    appComponentDescriptors.push(...componentConfig.descriptors);
    appComponentHeaders.push(...componentConfig.headers);
    const generatedCodegen = generateComponentCodegen({
      appRequire,
      packageJson,
      packageRoot: root,
      dependencyName,
      gpui,
      generatedRoot: codegenRoot,
    });
    if (
      generatedCodegen.sources.length > 0 &&
      componentConfig.descriptors.length === 0
    ) {
      throw new Error(
        `${dependencyName}: GPUI component Codegen is enabled, but platforms.gpui.componentDescriptors is empty`,
      );
    }
    appComponentSources.push(
      ...generatedCodegen.sources,
      ...componentConfig.sources.map(source =>
        path.resolve(componentSourceRoot, source),
      ),
    );
    if (generatedCodegen.sources.length > 0 && generatedCodegen.libraryName) {
      appComponentIncludeDirs.push(
        path.join(codegenRoot, generatedCodegen.libraryName),
      );
    }
    appComponentIncludeDirs.push(
      ...componentConfig.includeDirs.map(directory =>
        path.resolve(componentSourceRoot, directory),
      ),
    );
    const specDirectory =
      packageJson.codegenConfig?.jsSrcsDir ?? gpui.specs ?? 'src';
    if (gpui.cppProvider) {
      if (
        typeof gpui.cppProvider !== 'string' ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(gpui.cppProvider)
      ) {
        throw new Error(
          `${dependencyName}: platforms.gpui.cppProvider must be a C++ function name`,
        );
      }
      const specDir = path.join(root, specDirectory);
      const cppSpecPaths = [];
      for (const file of findSpecFiles(specDir)) {
        const specPath = path.join(specDir, file);
        const moduleName = moduleNameForSpec(specPath);
        cppSpecPaths.push(specPath);
        cppTurboModules.push({
          dependencyName,
          moduleName,
          provider: gpui.cppProvider,
          hasCmake: Boolean(gpui.cmake),
          sources: gpui.cppSources
            ? gpui.cppSources.map(source => path.resolve(root, source))
            : gpui.cmake
              ? findCppSources(path.resolve(root, gpui.cmake))
              : [],
        });
        turboModuleSpecs.push(specPath);
      }
      if (cppSpecPaths.length > 0) {
        const moduleCodegenDirectory = generateModuleCodegen({
          appRequire,
          platformRequire,
          packageJson,
          dependencyName,
          specPaths: cppSpecPaths,
          generatedRoot: codegenRoot,
          generatedLibraries,
        });
        appComponentIncludeDirs.push(moduleCodegenDirectory);
        for (const entry of cppTurboModules) {
          if (
            entry.dependencyName === dependencyName &&
            entry.specs === undefined
          ) {
            entry.specs = cppSpecPaths;
            entry.headers = findGeneratedFiles(moduleCodegenDirectory).filter(
              file => file.endsWith('.h'),
            );
          }
        }
      }
    }
    if (!gpui.crate) {
      if (gpui.cmake) cmakeProjects.push(path.resolve(root, gpui.cmake));
      continue;
    }
    const crateName = gpui.crate;
    if (typeof crateName !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(crateName)) {
      throw new Error(
        `${dependencyName}: platforms.gpui.crate must be a Cargo crate name`,
      );
    }
    const defaultCargoPath = fs.existsSync(path.join(root, 'gpui/Cargo.toml'))
      ? 'gpui'
      : '.';
    const cargoPath = path.resolve(root, gpui.path ?? defaultCargoPath);
    if (!fs.existsSync(path.join(cargoPath, 'Cargo.toml'))) {
      throw new Error(`${dependencyName}: no Cargo.toml at ${cargoPath}`);
    }
    const alias = crateName.replaceAll('-', '_');
    const moduleTypes = [];
    const specDir = path.join(root, specDirectory);
    if (fs.existsSync(specDir)) {
      for (const file of findSpecFiles(specDir)) {
        const specPath = path.join(specDir, file);
        const moduleName = moduleNameForSpec(specPath);
        moduleTypes.push(moduleName);
        turboModuleSpecs.push(specPath);
      }
    }
    rustCrates.push({
      dependencyName,
      packageName: packageJson.name,
      crateName,
      alias,
      cargoPath,
      moduleTypes,
    });
    if (gpui.cmake) cmakeProjects.push(path.resolve(root, gpui.cmake));
  }

  // Node addons are loaded from the stock `.node` files a package ships, at
  // the absolute path the Babel plugin embeds (see
  // @react-native-gpui/core/babel-plugin-node-addons.js). Nothing is staged here any
  // more, but an app directory from an earlier run may still hold the old
  // staging tree, so remove it.
  fs.rmSync(path.join(autolinkRoot, 'node-api'), {
    recursive: true,
    force: true,
  });

  const localDesktopSource = path.join(projectRoot, 'desktop/src');
  if (fs.existsSync(localDesktopSource)) {
    for (const file of findSpecFiles(localDesktopSource)) {
      const specPath = path.join(localDesktopSource, file);
      moduleNameForSpec(specPath);
      turboModuleSpecs.push(specPath);
    }
  }

  const engineNames = new Map();
  for (const engine of jsEngines) {
    const previousDependency = engineNames.get(engine.name);
    if (previousDependency) {
      throw new Error(
        `${engine.dependencyName}: JS engine '${engine.name}' is already declared by ${previousDependency}`,
      );
    }
    engineNames.set(engine.name, engine.dependencyName);
  }
  if (jsEngines.length === 0) {
    throw new Error(
      'no JS engine installed; add @react-native-gpui/hermes (or another engine package) to the app dependencies',
    );
  }

  const generatedDir = autolinkRoot;
  fs.mkdirSync(generatedDir, { recursive: true });
  const manifest = {
    prebuilt,
    rustCrates,
    turboModuleSpecs,
    cppTurboModules,
    cmakeProjects,
    appComponentDescriptors,
    appComponentHeaders: [...new Set(appComponentHeaders)],
    appComponentSources: [...new Set(appComponentSources)],
    appComponentIncludeDirs: [...new Set(appComponentIncludeDirs)],
    jsEngines,
  };
  writeIfChanged(
    path.join(generatedDir, 'autolink.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const escapeToml = value => JSON.stringify(value);
  const autolinkCrate = generatedDir;
  fs.mkdirSync(path.join(autolinkCrate, 'src'), { recursive: true });
  const generatedDeps = rustCrates
    .map(({ alias, crateName, cargoPath }) => {
      const relativePath = path
        .relative(autolinkCrate, cargoPath)
        .split(path.sep)
        .join('/');
      return `${alias} = { package = ${escapeToml(crateName)}, path = ${escapeToml(relativePath)} }`;
    })
    .join('\n');
  writeIfChanged(
    path.join(autolinkCrate, 'Cargo.toml'),
    `[package]\nname = "rn-gpui-autolink"\nversion = "0.1.0"\nedition = "2021"\n${generatedDeps ? `\n[dependencies]\n${generatedDeps}\n` : ''}`,
  );
  // Every crate a module declares registers itself here, so the linker keeps
  // it. A crate with TurboModule specs registers those; a paint-only crate
  // registers component renderers or store observers instead.
  const ensureLinked = rustCrates.map(
    ({ alias }) => `    ${alias}::rn_gpui_register();`,
  );
  const generatedEnsureLinked = [
    'pub fn ensure_linked() {',
    '    unsafe {',
    '        rn_gpui_initialize_app_turbo_modules();',
    '    }',
    ...ensureLinked,
    '}',
  ].join('\n');
  writeIfChanged(
    path.join(autolinkCrate, 'src/lib.rs'),
    `// Generated by @react-native-gpui/cli autolink; do not edit.\nextern "C" {\n    fn rn_gpui_initialize_app_turbo_modules();\n}\n${generatedEnsureLinked}\n`,
  );

  const appCargoManifest = path.join(desktopRoot, 'Cargo.toml');
  if (!fs.existsSync(appCargoManifest)) {
    throw new Error(`missing desktop Cargo manifest: ${appCargoManifest}`);
  }
  let appCargo = fs.readFileSync(appCargoManifest, 'utf8');
  const runtimeCrateRelativePath = path
    .relative(desktopRoot, runtimeCrate)
    .split(path.sep)
    .join('/');
  const runtimeCrateTomlPath = escapeToml(runtimeCrateRelativePath);
  const runtimeDependencyPattern = /^(react-native-gpui\s*=\s*)\{([^\n]*)\}$/mu;
  if (runtimeDependencyPattern.test(appCargo)) {
    appCargo = appCargo.replace(
      runtimeDependencyPattern,
      (_line, prefix, properties) => {
        const withoutOldPath = properties
          .replace(/(?:^|,)\s*path\s*=\s*"[^"]*"\s*/gu, '')
          .trim()
          .replace(/^,\s*|\s*,\s*$/gu, '');
        return `${prefix}{ path = ${runtimeCrateTomlPath}${withoutOldPath ? `, ${withoutOldPath}` : ''} }`;
      },
    );
  } else {
    appCargo = appCargo.replace(
      /^\[dependencies\]\s*$/mu,
      section =>
        `${section}\nreact-native-gpui = { path = ${runtimeCrateTomlPath} }`,
    );
  }
  if (!/^react-native-gpui\s*=/mu.test(appCargo)) {
    throw new Error(`could not add react-native-gpui to ${appCargoManifest}`);
  }
  if (!/^rn-gpui-autolink\s*=/mu.test(appCargo)) {
    appCargo = appCargo.replace(
      /^\[dependencies\]\s*$/mu,
      section => `${section}\nrn-gpui-autolink = { path = "autolink" }`,
    );
    if (!/^rn-gpui-autolink\s*=/mu.test(appCargo)) {
      appCargo += `\n[dependencies]\nrn-gpui-autolink = { path = "autolink" }\n`;
    }
  }
  // The app's own Rust TurboModules: its build script generates the glue, and
  // main.rs registers the modules it declares.
  const moduleCrate = path
    .relative(
      desktopRoot,
      path.join(path.dirname(runtimeCrate), 'rn-gpui-module'),
    )
    .split(path.sep)
    .join('/');
  const moduleBuildCrate = path
    .relative(
      desktopRoot,
      path.join(path.dirname(runtimeCrate), 'rn-gpui-module-build'),
    )
    .split(path.sep)
    .join('/');
  const moduleDependency = `rn-gpui-module = { path = ${escapeToml(moduleCrate)} }`;
  if (!/^rn-gpui-module\s*=/mu.test(appCargo)) {
    appCargo = appCargo.replace(
      /^\[dependencies\]\s*$/mu,
      section => `${section}\n${moduleDependency}`,
    );
  }
  const moduleBuildDependency = `rn-gpui-module-build = { path = ${escapeToml(moduleBuildCrate)} }`;
  if (!/^rn-gpui-module-build\s*=/mu.test(appCargo)) {
    if (/^\[build-dependencies\]\s*$/mu.test(appCargo)) {
      appCargo = appCargo.replace(
        /^\[build-dependencies\]\s*$/mu,
        section => `${section}\n${moduleBuildDependency}`,
      );
    } else {
      appCargo += `\n[build-dependencies]\n${moduleBuildDependency}\n`;
    }
  }
  if (!/^\[features\]\s*$/mu.test(appCargo)) {
    appCargo = appCargo.replace(
      /^\[dependencies\]\s*$/mu,
      '[features]\nvisual-capture = ["react-native-gpui/visual-capture"]\ntest-driver = ["react-native-gpui/test-driver"]\n\n[dependencies]',
    );
  } else {
    const tableStart = appCargo.indexOf('[features]');
    const suffixStart = appCargo.indexOf(
      '\n[',
      tableStart + '[features]'.length,
    );
    const tableEnd = suffixStart < 0 ? appCargo.length : suffixStart;
    let featureLines = appCargo.slice(
      tableStart + '[features]'.length,
      tableEnd,
    );
    if (!/^visual-capture\s*=/mu.test(featureLines))
      featureLines += '\nvisual-capture = ["react-native-gpui/visual-capture"]';
    if (!/^test-driver\s*=/mu.test(featureLines))
      featureLines += '\ntest-driver = ["react-native-gpui/test-driver"]';
    appCargo = `${appCargo.slice(0, tableStart)}[features]${featureLines}${appCargo.slice(tableEnd)}`;
  }
  writeIfChanged(appCargoManifest, appCargo);
  const appMain = path.join(desktopRoot, 'src/main.rs');
  if (fs.existsSync(appMain)) {
    let source = fs.readFileSync(appMain, 'utf8');
    if (!source.includes('rn_gpui_autolink::ensure_linked()')) {
      if (!/fn main\s*\(\s*\)\s*\{/u.test(source)) {
        throw new Error(
          `${appMain} must define fn main() for GPUI autolinking`,
        );
      }
      source = source.replace(
        /(fn main\s*\(\s*\)\s*\{)/u,
        '$1\n    rn_gpui_autolink::ensure_linked();',
      );
      writeIfChanged(appMain, source);
    }
  }
  const cppProviderPath = path.join(
    generatedDir,
    'CppTurboModules.generated.cpp',
  );
  const cppProviderCases = cppTurboModules
    .map(
      ({ moduleName, provider }) =>
        `  if (name == ${JSON.stringify(moduleName)}) return ::${provider}(name, jsInvoker);`,
    )
    .join('\n');
  const componentHeaders = [...new Set(appComponentHeaders)]
    .map(header => `#include <${header}>`)
    .join('\n');
  const componentRegistration = appComponentDescriptors
    .map(
      descriptor =>
        `  addComponent(facebook::react::concreteComponentDescriptorProvider<facebook::react::${descriptor}>());`,
    )
    .join('\n');
  writeIfChanged(
    cppProviderPath,
    `// Generated by @react-native-gpui/cli autolink; do not edit.\n#include <ReactCommon/TurboModule.h>\n#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>\n#include <iostream>\n#include <memory>\n#include <string>\n#include <unordered_set>\n${componentHeaders}\n${[...new Set(cppTurboModules.map(({ provider }) => `extern std::shared_ptr<facebook::react::TurboModule> ${provider}(const std::string&, std::shared_ptr<facebook::react::CallInvoker>);`))].join('\n')}\nextern "C" void rn_gpui_set_app_cpp_turbo_module_provider(std::shared_ptr<facebook::react::TurboModule> (*)(const std::string&, std::shared_ptr<facebook::react::CallInvoker>));\nextern "C" void rn_gpui_initialize_app_turbo_modules() {\n  rn_gpui_set_app_cpp_turbo_module_provider(+[](const std::string& name, std::shared_ptr<facebook::react::CallInvoker> jsInvoker) -> std::shared_ptr<facebook::react::TurboModule> {\n${cppProviderCases}\n    return nullptr;\n  });\n}\nnamespace rngpui {\nvoid rn_gpui_register_app_components(facebook::react::ComponentDescriptorProviderRegistry& registry) {\n  static const std::unordered_set<std::string> builtins = {"View", "Paragraph", "Text", "RawText", "Image", "ScrollView", "TextInput", "ModalHostView", "NativeViewHost"};\n  std::unordered_set<std::string> registered;\n  auto addComponent = [&registry, &registered](const facebook::react::ComponentDescriptorProvider& provider) {\n    const std::string name(provider.name);\n    if (builtins.contains(name) || !registered.insert(name).second) {\n      std::cerr << "[rn-gpui] duplicate app Fabric component descriptor ignored: " << name << std::endl;\n      return;\n    }\n    registry.add(provider);\n  };\n${componentRegistration}\n}\n} // namespace rngpui\n`,
  );
  const cppSources = [
    ...new Set([
      ...cppTurboModules
        .filter(({ hasCmake }) => !hasCmake)
        .flatMap(({ sources }) => sources),
      ...appComponentSources,
    ]),
  ];
  const cmakePath = value => value.replaceAll('\\', '/').replaceAll('"', '\\"');
  const cmake = [
    ...cmakeProjects.map(
      (directory, index) =>
        `add_subdirectory("${cmakePath(directory)}" "${cmakePath(path.join('${CMAKE_BINARY_DIR}', `rn_gpui_autolink_${index}`))}")`,
    ),
    `set(RN_GPUI_APP_CPP_PROVIDER_SOURCE "${cmakePath(cppProviderPath)}")`,
    `set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES ${cppSources.map(source => `"${cmakePath(source)}"`).join(' ')})`,
    `set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS ${appComponentIncludeDirs.map(directory => `"${cmakePath(directory)}"`).join(' ')})`,
    // Core calls each registration symbol from the generated
    // rn_gpui_install_modules(), so the engine registry is populated before
    // the host selects an engine.
    ...jsEngines.map(
      engine =>
        `set_property(GLOBAL APPEND PROPERTY RN_GPUI_JS_ENGINE_REGISTRATIONS "${engine.register}")`,
    ),
  ].join('\n');
  writeIfChanged(
    path.join(generatedDir, 'autolink.cmake'),
    `# Generated by @react-native-gpui/cli autolink.\n${cmake}\n`,
  );
  console.log(
    `Autolinked ${rustCrates.length} GPUI Rust crate(s), ${cppTurboModules.length} C++ TurboModule(s), ${cmakeProjects.length} CMake project(s), and ${jsEngines.length} JS engine(s) [${jsEngines.map(({ name }) => name).join(', ')}].`,
  );
  return config;
}
