#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cliDir = path.dirname(fileURLToPath(import.meta.url));
const requestedCommand = process.argv[2];
const command = requestedCommand === "run-desktop" ? "run" : requestedCommand;
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const projectRoot = path.resolve(option("--project-root") ?? process.cwd());
const desktopRoot = path.join(projectRoot, "desktop");
const gpuiCache = path.join(desktopRoot, ".cache/react-native-gpui");
const run = (bin, args, options = {}) =>
  execFileSync(bin, args, {
    cwd: options.cwd ?? projectRoot,
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env,
  });

if (command === "init") {
  const appName = process.argv[3];
  if (!appName || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(appName)) {
    console.error("usage: rn-gpui init <AppName> [--directory path]");
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
    path.join(cliDir, "../template/desktop/metro.config.js"),
    path.join(destination, "desktop/metro.config.js"),
  );
  fs.mkdirSync(path.join(destination, "desktop/src"), { recursive: true });
  const desktopPackageName = `rn-gpui-${path
    .basename(destination)
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-")}`;
  fs.writeFileSync(
    path.join(destination, "desktop/Cargo.toml"),
    `[package]\nname = ${JSON.stringify(desktopPackageName)}\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nrn-gpui = { path = "../node_modules/react-native-gpui/ReactGpui/rn-gpui" }\n`,
  );
  fs.copyFileSync(
    path.join(cliDir, "../template/App.js"),
    path.join(destination, "App.tsx"),
  );
  fs.copyFileSync(
    path.join(cliDir, "../template/desktop/build.rs"),
    path.join(destination, "desktop/build.rs"),
  );
  fs.copyFileSync(
    path.join(cliDir, "../template/desktop/src/main.rs"),
    path.join(destination, "desktop/src/main.rs"),
  );
  fs.writeFileSync(
    path.join(destination, "desktop/.gitignore"),
    "build/\n.cache/\n",
  );
  fs.copyFileSync(
    path.join(cliDir, "../template/desktop/README.md"),
    path.join(destination, "desktop/README.md"),
  );
  console.log(
    `Created standard React Native project ${appName} (iOS, Android, and GPUI desktop) in ${destination}. Run npm install, then npx react-native run-desktop.`,
  );
  process.exit(0);
}

if (!["autolink", "bundle", "run"].includes(command)) {
  console.error("usage: rn-gpui <init|autolink|bundle|run> [options]");
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
  run("npx", ["rn-gpui", "autolink"]);
  const gpuiPackage = path.resolve(cliDir, "../../../react-native-gpui");
  const appCargoManifest = path.join(desktopRoot, "Cargo.toml");
  const cargoManifest = path.join(gpuiPackage, "ReactGpui/Cargo.toml");
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
  const cargoArgs = fs.existsSync(appCargoManifest)
    ? ["run", "--release", "--manifest-path", appCargoManifest]
    : ["run", "--release", "--manifest-path", cargoManifest, "-p", "rn-gpui"];
  run("cargo", cargoArgs, {
    env: {
      ...process.env,
      CARGO_TARGET_DIR:
        process.env.CARGO_TARGET_DIR ?? path.join(desktopRoot, "build/target"),
      RN_GPUI_BUNDLE: bundlePath,
      RN_GPUI_MODULE: moduleName,
      RN_GPUI_APP_ID: appId,
      RN_GPUI_SOURCE_URL: entryFile.replace(/\.[^.]+$/u, ""),
      RN_GPUI_AUTOLINK_MANIFEST: path.join(gpuiCache, "autolink.json"),
      RN_GPUI_AUTOLINK_CMAKE: path.join(gpuiCache, "autolink.cmake"),
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
const projectAncestors = [];
for (let directory = projectRoot; ; directory = path.dirname(directory)) {
  projectAncestors.push(directory);
  if (path.dirname(directory) === directory) break;
}
const cargoRoot = [
  process.env.RN_GPUI_CARGO_ROOT,
  path.join(projectRoot, "ReactGpui"),
  path.join(projectRoot, "packages/react-native-gpui/ReactGpui"),
  ...projectAncestors.map((directory) =>
    path.join(directory, "node_modules/react-native-gpui/ReactGpui"),
  ),
]
  .filter(Boolean)
  .map((candidate) => path.resolve(candidate))
  .find((candidate) => fs.existsSync(path.join(candidate, "Cargo.toml")));
if (!cargoRoot)
  throw new Error(`could not find ReactGpui/Cargo.toml under ${projectRoot}`);

const rustCrates = [];
const turboModuleSpecs = [];
const cmakeProjects = [];
for (const [dependencyName, dependency] of Object.entries(
  config.dependencies ?? {},
)) {
  const gpui = dependency.platforms?.gpui;
  if (!gpui?.crate) continue;
  const root = fs.realpathSync(
    path.resolve(
      dependency.root ?? path.join(projectRoot, "node_modules", dependencyName),
    ),
  );
  const crateName = gpui.crate;
  if (typeof crateName !== "string" || !/^[A-Za-z0-9_-]+$/u.test(crateName)) {
    throw new Error(
      `${dependencyName}: platforms.gpui.crate must be a Cargo crate name`,
    );
  }
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const defaultCargoPath = fs.existsSync(
    path.join(root, "ReactGpui/Cargo.toml"),
  )
    ? "ReactGpui"
    : ".";
  const cargoPath = path.resolve(root, gpui.path ?? defaultCargoPath);
  if (!fs.existsSync(path.join(cargoPath, "Cargo.toml"))) {
    throw new Error(`${dependencyName}: no Cargo.toml at ${cargoPath}`);
  }
  const alias = crateName.replaceAll("-", "_");
  const moduleTypes = [];
  const specDir = path.join(root, gpui.specs ?? "src-gpui");
  if (fs.existsSync(specDir)) {
    for (const file of fs
      .readdirSync(specDir)
      .filter((entry) => /^Native.*\.d\.ts$/u.test(entry))) {
      const specPath = path.join(specDir, file);
      const specSource = fs.readFileSync(specPath, "utf8");
      const rustType = specSource.match(
        /rn-gpui:rust-type\s+([A-Za-z_][A-Za-z0-9_]*)/u,
      )?.[1];
      if (!rustType)
        throw new Error(
          `${specPath} must declare // rn-gpui:rust-type TypeName`,
        );
      moduleTypes.push(rustType);
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

// Project-local TurboModules live beside the app's Rust entry point. They do
// not need a publishable npm package or an extra autolinking command: the
// normal run-desktop autolink pass feeds their specs to the shared C++ codegen.
const localDesktopSource = path.join(projectRoot, "desktop/src");
if (fs.existsSync(localDesktopSource)) {
  for (const file of fs
    .readdirSync(localDesktopSource)
    .filter((entry) => /^Native.*\.d\.ts$/u.test(entry))) {
    const specPath = path.join(localDesktopSource, file);
    const specSource = fs.readFileSync(specPath, "utf8");
    if (!/rn-gpui:rust-type\s+([A-Za-z_][A-Za-z0-9_]*)/u.test(specSource)) {
      throw new Error(
        `${specPath} must declare // rn-gpui:rust-type TypeName`,
      );
    }
    turboModuleSpecs.push(specPath);
  }
}

const generatedDir = gpuiCache;
fs.mkdirSync(generatedDir, { recursive: true });
const manifest = { rustCrates, turboModuleSpecs, cmakeProjects };
fs.writeFileSync(
  path.join(generatedDir, "autolink.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const escapeToml = (value) => JSON.stringify(value);
const autolinkCrate = path.join(cargoRoot, "rn-gpui-autolink");
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
const ensureLinked = rustCrates
  .flatMap(({ alias, moduleTypes }) =>
    moduleTypes.map(
      (type) => `    let _ = ${alias}::${type.toUpperCase()}_RN_GPUI_MODULES;`,
    ),
  )
  .join("\n");
const generatedEnsureLinked = ensureLinked
  ? `pub fn ensure_linked() {\n${ensureLinked}\n}`
  : "pub fn ensure_linked() {}";
fs.writeFileSync(
  path.join(autolinkCrate, "src/lib.rs"),
  `// Generated by @react-native-gpui/cli autolink; do not edit.\n${generatedEnsureLinked}\n`,
);

const dependencyPath = path.join(cargoRoot, "rn-gpui/Cargo.toml");
let cargo = fs.readFileSync(dependencyPath, "utf8");
const depStart = "# BEGIN RN-GPUI AUTOLINK DEPENDENCIES";
const depEnd = "# END RN-GPUI AUTOLINK DEPENDENCIES";
const depBlock = `${depStart}\nrn-gpui-autolink = { path = "../rn-gpui-autolink" }\n${depEnd}`;
if (cargo.includes(depStart)) {
  cargo = cargo.replace(
    new RegExp(`${depStart}[\\s\\S]*?${depEnd}`, "u"),
    depBlock,
  );
} else {
  cargo = cargo.replace("[dependencies]\n", `[dependencies]\n${depBlock}\n`);
}
fs.writeFileSync(dependencyPath, cargo);

const workspacePath = path.join(cargoRoot, "Cargo.toml");
let workspace = fs.readFileSync(workspacePath, "utf8");
const memberStart = "# BEGIN RN-GPUI AUTOLINK MEMBERS";
const memberEnd = "# END RN-GPUI AUTOLINK MEMBERS";
const members = '"rn-gpui-autolink"';
const memberBlock = `${memberStart}\n${members}\n${memberEnd}`;
if (workspace.includes(memberStart)) {
  workspace = workspace.replace(
    new RegExp(`${memberStart}[\\s\\S]*?${memberEnd}`, "u"),
    memberBlock,
  );
} else {
  workspace = workspace.replace(
    'members = ["rn-gpui-sys", "rn-gpui", "rn-gpui-macros"]',
    `members = [\n  "rn-gpui-sys", "rn-gpui", "rn-gpui-macros",\n  ${memberStart}\n  ${members}\n  ${memberEnd}\n]`,
  );
}
fs.writeFileSync(workspacePath, workspace);

fs.writeFileSync(
  path.join(cargoRoot, "rn-gpui/src/autolink.rs"),
  `// Generated by @react-native-gpui/cli autolink; do not edit.\npub fn ensure_linked() {\n    rn_gpui_autolink::ensure_linked();\n}\n`,
);
const cmake = cmakeProjects
  .map(
    (directory) =>
      `add_subdirectory("${directory.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`,
  )
  .join("\n");
fs.writeFileSync(
  path.join(generatedDir, "autolink.cmake"),
  `# Generated by @react-native-gpui/cli autolink.\n${cmake}\n`,
);
console.log(
  `Autolinked ${rustCrates.length} GPUI Rust crate(s), ${turboModuleSpecs.length} TurboModule spec(s), and ${cmakeProjects.length} CMake project(s).`,
);
