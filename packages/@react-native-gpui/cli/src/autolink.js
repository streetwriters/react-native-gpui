import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
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

const findCppSources = directory => {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findCppSources(entryPath);
    return /\.(?:cc|cpp|cxx)$/u.test(entry.name) ? [entryPath] : [];
  });
};

const nodeApiMarker = 'react-native-node-api-module';
const nodeApiSuffix = '.apple.node';
const cppIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const includePath = /^[A-Za-z0-9_./+-]+$/u;
const jsEngineName = /^[a-z][a-z0-9-]*$/u;

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
  const { name, register, bundle, runtimeFiles } = jsEngine;
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
  return {
    dependencyName,
    name,
    register,
    bundle: resolveHook('bundle', bundle),
    runtimeFiles: resolveHook('runtimeFiles', runtimeFiles),
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

function findNodeApiModules(packageRoot, packageJson, dependencyName) {
  if (
    !packageJson.name ||
    ['react-native', 'react-native-node-api'].includes(packageJson.name)
  ) {
    return [];
  }
  const packageSegment = (
    packageJson.name.startsWith('@')
      ? packageJson.name.split('/').slice(1).join('/')
      : packageJson.name
  ).replaceAll(/[^A-Za-z0-9_-]/gu, '-');
  const modules = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        ['.git', 'node_modules'].includes(entry.name)
      ) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (
        entry.name.endsWith(nodeApiSuffix) &&
        fs.existsSync(path.join(entryPath, nodeApiMarker))
      ) {
        const addonName = entry.name
          .slice(0, -nodeApiSuffix.length)
          .replaceAll(/[^A-Za-z0-9_-]/gu, '-');
        modules.push({
          dependencyName,
          packageName: packageJson.name,
          libraryName: `${packageSegment}--${addonName}`,
          modulePath: entryPath,
        });
        continue;
      }
      visit(entryPath);
    }
  };
  visit(packageRoot);
  return modules;
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
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  let platformPackageJson;
  try {
    platformPackageJson = appRequire.resolve('react-native-gpui/package.json');
  } catch (error) {
    throw new Error(
      `could not resolve react-native-gpui from ${projectRoot}: ${error.message}`,
    );
  }
  const platformRoot = fs.realpathSync(path.dirname(platformPackageJson));
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
    throw new Error(`react-native-gpui has no Rust crate at ${runtimeCrate}`);
  }
  const rustCrates = [];
  const turboModuleSpecs = [];
  const rustTurboModuleSpecs = [];
  const cmakeProjects = [];
  const cppTurboModules = [];
  const appComponentDescriptors = [];
  const appComponentHeaders = [];
  const appComponentSources = [];
  const appComponentIncludeDirs = [];
  const componentNames = new Map();
  const jsEngines = [];
  const codegenRoot = path.join(autolinkRoot, 'codegen');
  const nodeApiModules = findNodeApiModules(
    projectRoot,
    JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')),
    '<app>',
  );
  const nodeApiFrameworksDir = path.join(
    autolinkRoot,
    'node-api/apple/Frameworks',
  );
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
    nodeApiModules.push(
      ...findNodeApiModules(root, packageJson, dependencyName),
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
      for (const file of findSpecFiles(specDir)) {
        const specPath = path.join(specDir, file);
        const moduleName = moduleNameForSpec(specPath);
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
        rustTurboModuleSpecs.push(specPath);
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

  if (process.platform === 'darwin' && nodeApiModules.length > 0) {
    fs.rmSync(nodeApiFrameworksDir, { recursive: true, force: true });
    const nodeApiCli = appRequire.resolve('react-native-node-api/cli');
    const result = spawnSync(
      process.execPath,
      [
        nodeApiCli,
        'link',
        '--apple',
        '--no-prune',
        '--exclude-self',
        projectRoot,
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          RN_NODE_API_AUTOLINK_PATH: path.join(autolinkRoot, 'node-api'),
          TARGET_BUILD_DIR: path.join(autolinkRoot, 'node-api'),
          FRAMEWORKS_FOLDER_PATH: 'apple/Frameworks',
          PLATFORM_NAME: 'macosx',
          ARCHS: process.arch === 'arm64' ? 'arm64' : 'x86_64',
          CODE_SIGNING_REQUIRED: 'NO',
          CODE_SIGNING_ALLOWED: 'NO',
        },
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `Node-API framework staging failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }

  const nodeApiNames = new Map();
  for (const addon of nodeApiModules) {
    const previousPath = nodeApiNames.get(addon.libraryName);
    if (previousPath && previousPath !== addon.modulePath) {
      throw new Error(
        `Node-API addon name collision for ${addon.libraryName}: ${previousPath} and ${addon.modulePath}`,
      );
    }
    nodeApiNames.set(addon.libraryName, addon.modulePath);
  }

  // Project-local TurboModules live beside the app's Rust entry point. They do
  // not need a publishable npm package or an extra autolinking command: the
  // normal run-desktop autolink pass feeds their specs to the shared C++ codegen.
  const localDesktopSource = path.join(projectRoot, 'desktop/src');
  if (fs.existsSync(localDesktopSource)) {
    for (const file of findSpecFiles(localDesktopSource)) {
      const specPath = path.join(localDesktopSource, file);
      moduleNameForSpec(specPath);
      turboModuleSpecs.push(specPath);
      rustTurboModuleSpecs.push(specPath);
    }
  }

  // JS engines are installed packages: autolink links every one it finds, and
  // the app picks between them at launch. Duplicate names would make that
  // choice ambiguous, so they fail here rather than at startup.
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
    rustCrates,
    turboModuleSpecs,
    rustTurboModuleSpecs,
    cppTurboModules,
    cmakeProjects,
    nodeApiModules,
    appComponentDescriptors,
    appComponentHeaders: [...new Set(appComponentHeaders)],
    appComponentSources: [...new Set(appComponentSources)],
    appComponentIncludeDirs: [...new Set(appComponentIncludeDirs)],
    jsEngines,
  };
  fs.writeFileSync(
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
  fs.writeFileSync(
    path.join(autolinkCrate, 'Cargo.toml'),
    `[package]\nname = "rn-gpui-autolink"\nversion = "0.1.0"\nedition = "2021"\n${generatedDeps ? `\n[dependencies]\n${generatedDeps}\n` : ''}`,
  );
  const ensureLinked = rustCrates.flatMap(({ alias, moduleTypes }) =>
    moduleTypes.map(
      type => `    let _ = ${alias}::${type.toUpperCase()}_RN_GPUI_MODULES;`,
    ),
  );
  const generatedEnsureLinked = [
    'pub fn ensure_linked() {',
    '    unsafe {',
    '        rn_gpui_initialize_app_turbo_modules();',
    '    }',
    ...ensureLinked,
    '}',
  ].join('\n');
  fs.writeFileSync(
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
  fs.writeFileSync(appCargoManifest, appCargo);
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
      fs.writeFileSync(appMain, source);
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
  fs.writeFileSync(
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
    `set(RN_GPUI_NODE_API_MODULE_NAMES ${nodeApiModules.map(({ libraryName }) => `"${libraryName}"`).join(' ')})`,
    `set(RN_GPUI_NODE_API_STAGED_FRAMEWORKS_DIR "${cmakePath(nodeApiFrameworksDir)}")`,
    // Core calls each registration symbol from the generated
    // rn_gpui_install_extensions(), so the engine registry is populated before
    // the host selects an engine.
    ...jsEngines.map(
      engine =>
        `set_property(GLOBAL APPEND PROPERTY RN_GPUI_JS_ENGINE_REGISTRATIONS "${engine.register}")`,
    ),
  ].join('\n');
  fs.writeFileSync(
    path.join(generatedDir, 'autolink.cmake'),
    `# Generated by @react-native-gpui/cli autolink.\n${cmake}\n`,
  );
  console.log(
    `Autolinked ${rustCrates.length} GPUI Rust crate(s), ${rustTurboModuleSpecs.length} Rust TurboModule spec(s), ${cppTurboModules.length} C++ TurboModule(s), ${nodeApiModules.length} Node-API addon(s), ${cmakeProjects.length} CMake project(s), and ${jsEngines.length} JS engine(s) [${jsEngines.map(({ name }) => name).join(', ')}].`,
  );
  return config;
}
