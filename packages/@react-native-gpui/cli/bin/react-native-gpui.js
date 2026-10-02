#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const cliDir = path.dirname(fileURLToPath(import.meta.url));
const requestedCommand = process.argv[2];
const command = requestedCommand === "run-desktop" ? "run" : requestedCommand;
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const hasFlag = (name) => process.argv.includes(name);
const projectRoot = path.resolve(option("--project-root") ?? process.cwd());
const desktopRoot = path.join(projectRoot, "desktop");
const autolinkRoot = path.join(desktopRoot, "autolink");
const run = (bin, args, options = {}) =>
  execFileSync(bin, args, {
    cwd: options.cwd ?? projectRoot,
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env,
  });
const findCppSources = (directory) => {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findCppSources(entryPath);
    return /\.(?:cc|cpp|cxx)$/u.test(entry.name) ? [entryPath] : [];
  });
};

if (command === "init-desktop") {
  const snapshots = new Map();
  const createdDirectories = new Set();
  const track = (file) => {
    if (!snapshots.has(file)) {
      snapshots.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
    }
  };
  const write = (file, contents) => {
    track(file);
    const missingDirectories = [];
    for (
      let directory = path.dirname(file);
      directory.startsWith(projectRoot) && !fs.existsSync(directory);
      directory = path.dirname(directory)
    ) {
      missingDirectories.push(directory);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const directory of missingDirectories)
      createdDirectories.add(directory);
    fs.writeFileSync(file, contents);
  };
  const manualSteps = [
    "Install react-native-gpui and @react-native-gpui/cli in the app.",
    "Copy the desktop/ scaffold from @react-native-gpui/cli/templates/app/desktop.",
    "Add desktop/metro.config.js with the GPUI Metro platform configuration.",
    "Run npm install (or your package manager), then npx react-native run-desktop.",
  ];
  try {
    const packagePath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(packagePath))
      throw new Error(`no package.json found in ${projectRoot}`);
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (
      !packageJson.dependencies?.["react-native"] &&
      !packageJson.devDependencies?.["react-native"]
    ) {
      throw new Error("package.json does not declare react-native");
    }
    for (const relativePath of [
      "desktop/metro.config.js",
      "desktop/build.rs",
      "desktop/src/main.rs",
      "desktop/README.md",
      "desktop/.gitignore",
    ]) {
      const target = path.join(projectRoot, relativePath);
      if (!fs.existsSync(target)) {
        if (relativePath === "desktop/.gitignore") {
          write(target, "build/\n.cache/\nautolink/\n");
        } else {
          const template = path.join(cliDir, "../templates/app", relativePath);
          write(target, fs.readFileSync(template));
        }
      }
    }
    const cargoPath = path.join(projectRoot, "desktop/Cargo.toml");
    if (!fs.existsSync(cargoPath)) {
      const appName = packageJson.name ?? path.basename(projectRoot);
      const cargoName = `react-native-gpui-${appName.toLowerCase().replaceAll(/[^a-z0-9-]/gu, "-")}`;
      write(
        cargoPath,
        `[package]\nname = ${JSON.stringify(cargoName)}\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
      );
    }
    const nextPackageJson = { ...packageJson };
    nextPackageJson.dependencies = {
      ...packageJson.dependencies,
      "react-native-gpui":
        packageJson.dependencies?.["react-native-gpui"] ?? "^0.1.0",
    };
    nextPackageJson.devDependencies = {
      ...packageJson.devDependencies,
      "@react-native-gpui/cli":
        packageJson.devDependencies?.["@react-native-gpui/cli"] ?? "^0.1.0",
    };
    write(packagePath, `${JSON.stringify(nextPackageJson, null, 2)}\n`);

    if (!hasFlag("--skip-install")) {
      const manager = fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))
        ? "pnpm"
        : fs.existsSync(path.join(projectRoot, "yarn.lock"))
          ? "yarn"
          : fs.existsSync(path.join(projectRoot, "bun.lockb")) ||
              fs.existsSync(path.join(projectRoot, "bun.lock"))
            ? "bun"
            : "npm";
      const lockFiles = [
        "package-lock.json",
        "npm-shrinkwrap.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "bun.lock",
        "bun.lockb",
      ];
      for (const lock of lockFiles) track(path.join(projectRoot, lock));
      run(manager, manager === "npm" ? ["install"] : ["install"], {
        cwd: projectRoot,
      });
    }
    console.log(
      `Added GPUI desktop support to ${projectRoot}. Run npx react-native run-desktop.`,
    );
  } catch (error) {
    for (const [file, contents] of [...snapshots.entries()].reverse()) {
      if (contents === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, contents);
    }
    for (const directory of createdDirectories) {
      try {
        fs.rmdirSync(directory);
      } catch {}
    }
    console.error(
      `init-desktop failed and restored its file changes: ${error.message}`,
    );
    console.error("Manual steps to add desktop support:");
    for (const step of manualSteps) console.error(`  - ${step}`);
    process.exit(1);
  }
  process.exit(0);
}

if (command === "create-library") {
  const libraryName = process.argv[3];
  const type = option("--type") ?? "rust";
  if (
    !libraryName ||
    !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(libraryName) ||
    !["rust", "cpp"].includes(type)
  ) {
    console.error(
      "usage: npx react-native create-library <Name> [--type rust|cpp] [--module-name PascalCase] [--package-name name] [--directory path]",
    );
    process.exit(2);
  }
  const destination = path.resolve(option("--directory") ?? libraryName);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length)
    throw new Error(`destination is not empty: ${destination}`);
  const slug = libraryName
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-");
  const words = libraryName.match(/[A-Z]?[a-z0-9]+|[A-Z]+/gu) ?? [libraryName];
  const moduleStem = words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  const moduleName = option("--module-name") ?? `RN${moduleStem}Module`;
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(moduleName)) {
    throw new Error("--module-name must be a PascalCase identifier");
  }
  const specName = `Native${moduleStem}`;
  const rustSymbolPrefix = moduleName.toLowerCase();
  const cppProvider = `create_${slug.replaceAll("-", "_")}_module`;
  const packageName = option("--package-name") ?? `react-native-${slug}`;
  const templateRoot = path.join(cliDir, `../templates/modules/${type}`);
  fs.mkdirSync(destination, { recursive: true });
  const replaceTokens = (source) =>
    source
      .replaceAll("NativeModule", specName)
      .replaceAll("RNMODULE", moduleName.toUpperCase())
      .replaceAll("RNModule", moduleName)
      .replaceAll("rnmodule", rustSymbolPrefix)
      .replaceAll("create_rn_module", cppProvider);
  const moduleFiles =
    type === "rust"
      ? {
          [`src/${specName}.ts`]: "NativeModule.ts",
          "src/index.ts": "index.ts",
          "gpui/src/lib.rs": "lib.rs",
        }
      : {
          [`src/${specName}.ts`]: "NativeModule.ts",
          "src/index.ts": "index.ts",
          [`gpui/cpp/${moduleName}.hpp`]: "RNModule.hpp",
          [`gpui/cpp/${moduleName}.cpp`]: "RNModule.cpp",
          "gpui/CMakeLists.txt": "CMakeLists.txt",
        };
  for (const [target, source] of Object.entries(moduleFiles)) {
    const targetPath = path.join(destination, target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      replaceTokens(fs.readFileSync(path.join(templateRoot, source), "utf8")),
    );
  }
  const gpuiPlatform =
    type === "rust"
      ? {
          crate: `rn-gpui-${slug}`,
        }
      : {
          cmake: "gpui",
          cppProvider,
        };
  const pkg = {
    name: packageName,
    version: "0.1.0",
    main: "src/index.ts",
    files: ["src", "gpui", "react-native.config.js", "README.md"],
    codegenConfig: {
      name: `${moduleName}Spec`,
      type: "modules",
      jsSrcsDir: "src",
    },
    peerDependencies: { "react-native": ">=0.76" },
  };
  fs.writeFileSync(
    path.join(destination, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(destination, "react-native.config.js"),
    `module.exports = ${JSON.stringify({ dependency: { platforms: { gpui: gpuiPlatform } } }, null, 2)};\n`,
  );
  if (type === "rust") {
    fs.writeFileSync(
      path.join(destination, "gpui/Cargo.toml"),
      `[package]\nname = ${JSON.stringify(`rn-gpui-${slug}`)}\nversion = "0.1.0"\nedition = "2021"\n`,
    );
  } else {
    fs.writeFileSync(
      path.join(destination, "README.md"),
      `# ${libraryName}\n\nC++ TurboModule library for React Native GPUI. The spec is in src/${specName}.ts and uses React Native's public TurboModuleRegistry API. The implementation is in gpui/cpp/${moduleName}.cpp and is discovered through package metadata. Import the default export from ${pkg.name} and call its typed greet(name) method.\n`,
    );
  }
  if (type === "rust") {
    fs.writeFileSync(
      path.join(destination, "README.md"),
      `# ${libraryName}\n\nRust TurboModule library for React Native GPUI. The spec is in src/${specName}.ts and uses React Native's public TurboModuleRegistry API. The implementation is in gpui/src/lib.rs and is discovered through package metadata. Import the default export from ${pkg.name} and call its typed greet(name) method.\n`,
    );
  }
  console.log(
    `Created ${type} TurboModule library ${pkg.name} in ${destination}. Install/link it in a React Native app, then run npx react-native run-desktop.`,
  );
  process.exit(0);
}

if (command === "init") {
  const appName = process.argv[3];
  if (!appName || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(appName)) {
    console.error("usage: react-native-gpui init <AppName> [--directory path]");
    process.exit(2);
  }
  const destination = path.resolve(option("--directory") ?? appName);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
    throw new Error(`destination is not empty: ${destination}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const initOptions = process.argv.slice(4);
  for (let index = 0; index < initOptions.length; index += 1) {
    if (
      initOptions[index] === "--directory" ||
      initOptions[index] === "--project-root"
    ) {
      initOptions.splice(index, 2);
      index -= 1;
    }
  }
  run(
    "npx",
    [
      "--yes",
      "@react-native-community/cli@^20.2.0",
      "init",
      appName,
      "--version",
      "0.87.1",
      "--skip-install",
      "--directory",
      destination,
      ...initOptions,
    ],
    { cwd: path.dirname(destination) },
  );
  const packagePath = path.join(destination, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    "react-native-gpui": "^0.1.0",
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@react-native-gpui/cli": "^0.1.0",
  };
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.mkdirSync(path.join(destination, "desktop"), { recursive: true });
  fs.copyFileSync(
    path.join(cliDir, "../templates/app/desktop/metro.config.js"),
    path.join(destination, "desktop/metro.config.js"),
  );
  fs.mkdirSync(path.join(destination, "desktop/src"), { recursive: true });
  const desktopPackageName = `rn-gpui-${path
    .basename(destination)
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-")}`;
  fs.writeFileSync(
    path.join(destination, "desktop/Cargo.toml"),
    `[package]\nname = ${JSON.stringify(desktopPackageName)}\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
  );
  fs.copyFileSync(
    path.join(cliDir, "../templates/app/App.tsx"),
    path.join(destination, "App.tsx"),
  );
  fs.copyFileSync(
    path.join(cliDir, "../templates/app/desktop/build.rs"),
    path.join(destination, "desktop/build.rs"),
  );
  fs.copyFileSync(
    path.join(cliDir, "../templates/app/desktop/src/main.rs"),
    path.join(destination, "desktop/src/main.rs"),
  );
  fs.writeFileSync(
    path.join(destination, "desktop/.gitignore"),
    "build/\n.cache/\nautolink/\n",
  );
  fs.copyFileSync(
    path.join(cliDir, "../templates/app/desktop/README.md"),
    path.join(destination, "desktop/README.md"),
  );
  console.log(
    `Created standard React Native project ${appName} (iOS, Android, and GPUI desktop) in ${destination}. Run npm install, then npx react-native run-desktop.`,
  );
  process.exit(0);
}

if (!["autolink", "bundle", "run"].includes(command)) {
  console.error(
    "usage: react-native-gpui <init|init-desktop|create-library|autolink|bundle|run> [options]",
  );
  process.exit(2);
}

if (command === "bundle" || command === "run") {
  const entryFile = option("--entry-file") ?? "index.js";
  const bundlePath = path.resolve(
    option("--bundle") ?? path.join(desktopRoot, "build/index.bundle"),
  );
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  const bundleArgs = [
    "react-native",
    "bundle",
    "--platform",
    "gpui",
    "--entry-file",
    entryFile,
    "--bundle-output",
    bundlePath,
    "--assets-dest",
    path.join(path.dirname(bundlePath), "assets"),
    "--dev",
    "false",
  ];
  const metroConfig =
    option("--config") ?? path.join(desktopRoot, "metro.config.js");
  if (fs.existsSync(metroConfig)) bundleArgs.push("--config", metroConfig);
  run("npx", bundleArgs);
  if (command === "bundle") process.exit(0);
  run(process.execPath, [
    path.join(cliDir, "react-native-gpui.js"),
    "autolink",
  ]);
  const appCargoManifest = path.join(desktopRoot, "Cargo.toml");
  const appConfig = path.join(projectRoot, "app.json");
  const defaultModule = fs.existsSync(appConfig)
    ? JSON.parse(fs.readFileSync(appConfig, "utf8")).name
    : "App";
  const moduleName = option("--module") ?? defaultModule ?? "App";
  const appId =
    option("--app-id") ??
    `com.example.${path
      .basename(projectRoot)
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/gu, "-")}`;
  if (!fs.existsSync(appCargoManifest)) {
    throw new Error(`missing desktop Cargo manifest: ${appCargoManifest}`);
  }
  const cargoArgs = ["run", "--release", "--manifest-path", appCargoManifest];
  run("cargo", cargoArgs, {
    env: {
      ...process.env,
      CARGO_TARGET_DIR:
        process.env.CARGO_TARGET_DIR ?? path.join(desktopRoot, "build/target"),
      RN_GPUI_BUNDLE: bundlePath,
      RN_GPUI_MODULE: moduleName,
      RN_GPUI_APP_ID: appId,
      RN_GPUI_SOURCE_URL: entryFile.replace(/\.[^.]+$/u, ""),
      RN_GPUI_AUTOLINK_MANIFEST: path.join(autolinkRoot, "autolink.json"),
      RN_GPUI_AUTOLINK_CMAKE: path.join(autolinkRoot, "autolink.cmake"),
    },
  });
  process.exit(0);
}

const configFile = option("--config-json");
const config = JSON.parse(
  configFile
    ? fs.readFileSync(path.resolve(configFile), "utf8")
    : execFileSync("npx", ["react-native", "config"], {
        cwd: projectRoot,
        encoding: "utf8",
      }),
);
const appRequire = createRequire(path.join(projectRoot, "package.json"));
let platformPackageJson;
try {
  platformPackageJson = appRequire.resolve("react-native-gpui/package.json");
} catch (error) {
  throw new Error(
    `could not resolve react-native-gpui from ${projectRoot}: ${error.message}`,
  );
}
const platformRoot = fs.realpathSync(path.dirname(platformPackageJson));
const runtimeCrate = path.join(platformRoot, "ReactGpui/rn-gpui");
if (!fs.existsSync(path.join(runtimeCrate, "Cargo.toml"))) {
  throw new Error(`react-native-gpui has no Rust crate at ${runtimeCrate}`);
}
const rustCrates = [];
const turboModuleSpecs = [];
const rustTurboModuleSpecs = [];
const cmakeProjects = [];
const cppTurboModules = [];
for (const [dependencyName, dependency] of Object.entries(
  config.dependencies ?? {},
)) {
  const gpui = dependency.platforms?.gpui;
  if (!gpui) continue;
  const root = fs.realpathSync(
    path.resolve(
      dependency.root ?? path.join(projectRoot, "node_modules", dependencyName),
    ),
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const specDirectory =
    packageJson.codegenConfig?.jsSrcsDir ?? gpui.specs ?? "src";
  if (gpui.cppProvider) {
    if (
      typeof gpui.cppProvider !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(gpui.cppProvider)
    ) {
      throw new Error(
        `${dependencyName}: platforms.gpui.cppProvider must be a C++ function name`,
      );
    }
    const specDir = path.join(root, specDirectory);
    for (const file of fs
      .readdirSync(specDir)
      .filter((entry) =>
        /^(?:Native.*|RN.*ModuleSpec)(?:\.d)?\.ts$/u.test(entry),
      )) {
      const specPath = path.join(specDir, file);
      const specSource = fs.readFileSync(specPath, "utf8");
      const moduleName = specSource.match(
        /TurboModuleRegistry\.getEnforcing(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]\s*\)/u,
      )?.[1];
      if (!moduleName)
        throw new Error(
          `${specPath} must register its module with TurboModuleRegistry.getEnforcing()`,
        );
      cppTurboModules.push({
        dependencyName,
        moduleName,
        provider: gpui.cppProvider,
        hasCmake: Boolean(gpui.cmake),
        sources: gpui.cppSources
          ? gpui.cppSources.map((source) => path.resolve(root, source))
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
  if (typeof crateName !== "string" || !/^[A-Za-z0-9_-]+$/u.test(crateName)) {
    throw new Error(
      `${dependencyName}: platforms.gpui.crate must be a Cargo crate name`,
    );
  }
  const defaultCargoPath = fs.existsSync(path.join(root, "gpui/Cargo.toml"))
    ? "gpui"
    : ".";
  const cargoPath = path.resolve(root, gpui.path ?? defaultCargoPath);
  if (!fs.existsSync(path.join(cargoPath, "Cargo.toml"))) {
    throw new Error(`${dependencyName}: no Cargo.toml at ${cargoPath}`);
  }
  const alias = crateName.replaceAll("-", "_");
  const moduleTypes = [];
  const specDir = path.join(root, specDirectory);
  if (fs.existsSync(specDir)) {
    for (const file of fs
      .readdirSync(specDir)
      .filter((entry) =>
        /^(?:Native.*|RN.*ModuleSpec)(?:\.d)?\.ts$/u.test(entry),
      )) {
      const specPath = path.join(specDir, file);
      const specSource = fs.readFileSync(specPath, "utf8");
      const moduleName = specSource.match(
        /TurboModuleRegistry\.getEnforcing(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]\s*\)/u,
      )?.[1];
      if (!moduleName)
        throw new Error(
          `${specPath} must register its module with TurboModuleRegistry.getEnforcing()`,
        );
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

// Project-local TurboModules live beside the app's Rust entry point. They do
// not need a publishable npm package or an extra autolinking command: the
// normal run-desktop autolink pass feeds their specs to the shared C++ codegen.
const localDesktopSource = path.join(projectRoot, "desktop/src");
if (fs.existsSync(localDesktopSource)) {
  for (const file of fs
    .readdirSync(localDesktopSource)
    .filter((entry) =>
      /^(?:Native.*|RN.*ModuleSpec)(?:\.d)?\.ts$/u.test(entry),
    )) {
    const specPath = path.join(localDesktopSource, file);
    const specSource = fs.readFileSync(specPath, "utf8");
    if (
      !/TurboModuleRegistry\.getEnforcing(?:<[^>]+>)?\(\s*['"][^'"]+['"]\s*\)/u.test(
        specSource,
      )
    ) {
      throw new Error(
        `${specPath} must register its module with TurboModuleRegistry.getEnforcing()`,
      );
    }
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
};
fs.writeFileSync(
  path.join(generatedDir, "autolink.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const escapeToml = (value) => JSON.stringify(value);
const autolinkCrate = generatedDir;
fs.mkdirSync(path.join(autolinkCrate, "src"), { recursive: true });
const generatedDeps = rustCrates
  .map(({ alias, crateName, cargoPath }) => {
    const relativePath = path
      .relative(autolinkCrate, cargoPath)
      .split(path.sep)
      .join("/");
    return `${alias} = { package = ${escapeToml(crateName)}, path = ${escapeToml(relativePath)} }`;
  })
  .join("\n");
fs.writeFileSync(
  path.join(autolinkCrate, "Cargo.toml"),
  `[package]\nname = "rn-gpui-autolink"\nversion = "0.1.0"\nedition = "2021"\n${generatedDeps ? `\n[dependencies]\n${generatedDeps}\n` : ""}`,
);
const ensureLinked = rustCrates.flatMap(({ alias, moduleTypes }) =>
  moduleTypes.map(
    (type) => `    let _ = ${alias}::${type.toUpperCase()}_RN_GPUI_MODULES;`,
  ),
);
const generatedEnsureLinked = [
  "pub fn ensure_linked() {",
  "    unsafe {",
  "        rn_gpui_initialize_app_turbo_modules();",
  "    }",
  ...ensureLinked,
  "}",
].join("\n");
fs.writeFileSync(
  path.join(autolinkCrate, "src/lib.rs"),
  `// Generated by @react-native-gpui/cli autolink; do not edit.\nextern "C" {\n    fn rn_gpui_initialize_app_turbo_modules();\n}\n${generatedEnsureLinked}\n`,
);

const appCargoManifest = path.join(desktopRoot, "Cargo.toml");
if (!fs.existsSync(appCargoManifest)) {
  throw new Error(`missing desktop Cargo manifest: ${appCargoManifest}`);
}
let appCargo = fs.readFileSync(appCargoManifest, "utf8");
const runtimeCrateRelativePath = path
  .relative(desktopRoot, runtimeCrate)
  .split(path.sep)
  .join("/");
const runtimeCrateTomlPath = escapeToml(runtimeCrateRelativePath);
const runtimeDependencyPattern = /^(react-native-gpui\s*=\s*)\{([^\n]*)\}$/mu;
if (runtimeDependencyPattern.test(appCargo)) {
  appCargo = appCargo.replace(
    runtimeDependencyPattern,
    (_line, prefix, properties) => {
      const withoutOldPath = properties
        .replace(/(?:^|,)\s*path\s*=\s*"[^"]*"\s*/gu, "")
        .trim()
        .replace(/^,\s*|\s*,\s*$/gu, "");
      return `${prefix}{ path = ${runtimeCrateTomlPath}${withoutOldPath ? `, ${withoutOldPath}` : ""} }`;
    },
  );
} else {
  appCargo = appCargo.replace(
    /^\[dependencies\]\s*$/mu,
    (section) =>
      `${section}\nreact-native-gpui = { path = ${runtimeCrateTomlPath} }`,
  );
}
if (!/^react-native-gpui\s*=/mu.test(appCargo)) {
  throw new Error(`could not add react-native-gpui to ${appCargoManifest}`);
}
if (!/^rn-gpui-autolink\s*=/mu.test(appCargo)) {
  appCargo = appCargo.replace(
    /^\[dependencies\]\s*$/mu,
    (section) => `${section}\nrn-gpui-autolink = { path = "autolink" }`,
  );
  if (!/^rn-gpui-autolink\s*=/mu.test(appCargo)) {
    appCargo += `\n[dependencies]\nrn-gpui-autolink = { path = "autolink" }\n`;
  }
}
fs.writeFileSync(appCargoManifest, appCargo);
const appMain = path.join(desktopRoot, "src/main.rs");
if (fs.existsSync(appMain)) {
  let source = fs.readFileSync(appMain, "utf8");
  if (!source.includes("rn_gpui_autolink::ensure_linked()")) {
    if (!/fn main\s*\(\s*\)\s*\{/u.test(source)) {
      throw new Error(`${appMain} must define fn main() for GPUI autolinking`);
    }
    source = source.replace(
      /(fn main\s*\(\s*\)\s*\{)/u,
      "$1\n    rn_gpui_autolink::ensure_linked();",
    );
    fs.writeFileSync(appMain, source);
  }
}
const cppProviderPath = path.join(
  generatedDir,
  "CppTurboModules.generated.cpp",
);
const cppProviderCases = cppTurboModules
  .map(
    ({ moduleName, provider }) =>
      `  if (name == ${JSON.stringify(moduleName)}) return ::${provider}(name, jsInvoker);`,
  )
  .join("\n");
fs.writeFileSync(
  cppProviderPath,
  `// Generated by @react-native-gpui/cli autolink; do not edit.\n#include <ReactCommon/TurboModule.h>\n#include <memory>\n#include <string>\n${[...new Set(cppTurboModules.map(({ provider }) => `extern std::shared_ptr<facebook::react::TurboModule> ${provider}(const std::string&, std::shared_ptr<facebook::react::CallInvoker>);`))].join("\n")}\nextern "C" void rn_gpui_set_app_cpp_turbo_module_provider(std::shared_ptr<facebook::react::TurboModule> (*)(const std::string&, std::shared_ptr<facebook::react::CallInvoker>));\nextern "C" void rn_gpui_initialize_app_turbo_modules() {\n  rn_gpui_set_app_cpp_turbo_module_provider(+[](const std::string& name, std::shared_ptr<facebook::react::CallInvoker> jsInvoker) -> std::shared_ptr<facebook::react::TurboModule> {\n${cppProviderCases}\n    return nullptr;\n  });\n}\n`,
);
const cppSources = [
  ...new Set(
    cppTurboModules
      .filter(({ hasCmake }) => !hasCmake)
      .flatMap(({ sources }) => sources),
  ),
];
const cmakePath = (value) => value.replaceAll("\\", "/").replaceAll('"', '\\"');
const cmake = [
  ...cmakeProjects.map(
    (directory, index) =>
      `add_subdirectory("${cmakePath(directory)}" "${cmakePath(path.join("${CMAKE_BINARY_DIR}", `rn_gpui_autolink_${index}`))}")`,
  ),
  `set(RN_GPUI_APP_CPP_PROVIDER_SOURCE "${cmakePath(cppProviderPath)}")`,
  `list(APPEND RN_GPUI_APP_CPP_SOURCES ${cppSources.map((source) => `"${cmakePath(source)}"`).join(" ")})`,
].join("\n");
fs.writeFileSync(
  path.join(generatedDir, "autolink.cmake"),
  `# Generated by @react-native-gpui/cli autolink.\n${cmake}\n`,
);
console.log(
  `Autolinked ${rustCrates.length} GPUI Rust crate(s), ${rustTurboModuleSpecs.length} Rust TurboModule spec(s), ${cppTurboModules.length} C++ TurboModule(s), and ${cmakeProjects.length} CMake project(s).`,
);
