import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

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
      : execFileSync('npx', ['react-native', 'config'], {
          cwd: projectRoot,
          encoding: 'utf8',
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

  const generatedDir = autolinkRoot;
  fs.mkdirSync(generatedDir, { recursive: true });
  const manifest = {
    rustCrates,
    turboModuleSpecs,
    rustTurboModuleSpecs,
    cppTurboModules,
    cmakeProjects,
    nodeApiModules,
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
  fs.writeFileSync(
    cppProviderPath,
    `// Generated by @react-native-gpui/cli autolink; do not edit.\n#include <ReactCommon/TurboModule.h>\n#include <memory>\n#include <string>\n${[...new Set(cppTurboModules.map(({ provider }) => `extern std::shared_ptr<facebook::react::TurboModule> ${provider}(const std::string&, std::shared_ptr<facebook::react::CallInvoker>);`))].join('\n')}\nextern "C" void rn_gpui_set_app_cpp_turbo_module_provider(std::shared_ptr<facebook::react::TurboModule> (*)(const std::string&, std::shared_ptr<facebook::react::CallInvoker>));\nextern "C" void rn_gpui_initialize_app_turbo_modules() {\n  rn_gpui_set_app_cpp_turbo_module_provider(+[](const std::string& name, std::shared_ptr<facebook::react::CallInvoker> jsInvoker) -> std::shared_ptr<facebook::react::TurboModule> {\n${cppProviderCases}\n    return nullptr;\n  });\n}\n`,
  );
  const cppSources = [
    ...new Set(
      cppTurboModules
        .filter(({ hasCmake }) => !hasCmake)
        .flatMap(({ sources }) => sources),
    ),
  ];
  const cmakePath = value => value.replaceAll('\\', '/').replaceAll('"', '\\"');
  const cmake = [
    ...cmakeProjects.map(
      (directory, index) =>
        `add_subdirectory("${cmakePath(directory)}" "${cmakePath(path.join('${CMAKE_BINARY_DIR}', `rn_gpui_autolink_${index}`))}")`,
    ),
    `set(RN_GPUI_APP_CPP_PROVIDER_SOURCE "${cmakePath(cppProviderPath)}")`,
    `list(APPEND RN_GPUI_APP_CPP_SOURCES ${cppSources.map(source => `"${cmakePath(source)}"`).join(' ')})`,
    `set(RN_GPUI_NODE_API_MODULE_NAMES ${nodeApiModules.map(({ libraryName }) => `"${libraryName}"`).join(' ')})`,
    `set(RN_GPUI_NODE_API_STAGED_FRAMEWORKS_DIR "${cmakePath(nodeApiFrameworksDir)}")`,
  ].join('\n');
  fs.writeFileSync(
    path.join(generatedDir, 'autolink.cmake'),
    `# Generated by @react-native-gpui/cli autolink.\n${cmake}\n`,
  );
  console.log(
    `Autolinked ${rustCrates.length} GPUI Rust crate(s), ${rustTurboModuleSpecs.length} Rust TurboModule spec(s), ${cppTurboModules.length} C++ TurboModule(s), ${nodeApiModules.length} Node-API addon(s), and ${cmakeProjects.length} CMake project(s).`,
  );
}
