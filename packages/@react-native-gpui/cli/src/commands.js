import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { autolink } from "./autolink.js";

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(cliDir, "../templates");
const run = (bin, args, options = {}) =>
  execFileSync(bin, args, {
    cwd: options.cwd ?? process.cwd(),
    stdio: "inherit",
    env: options.env ?? process.env,
  });

export function runDesktop({
  projectRoot = process.cwd(),
  entryFile = "index.js",
  module,
  appId,
  bundle,
  config,
}) {
  projectRoot = path.resolve(projectRoot);
  const desktopRoot = path.join(projectRoot, "desktop");
  const bundlePath = path.resolve(
    bundle ?? path.join(desktopRoot, "build/index.bundle"),
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
  const metroConfig = config ?? path.join(desktopRoot, "metro.config.js");
  if (fs.existsSync(metroConfig)) bundleArgs.push("--config", metroConfig);
  run("npx", bundleArgs, { cwd: projectRoot });
  autolink({ projectRoot });

  const appCargoManifest = path.join(desktopRoot, "Cargo.toml");
  if (!fs.existsSync(appCargoManifest)) {
    throw new Error(`missing desktop Cargo manifest: ${appCargoManifest}`);
  }
  const appConfig = path.join(projectRoot, "app.json");
  const defaultModule = fs.existsSync(appConfig)
    ? JSON.parse(fs.readFileSync(appConfig, "utf8")).name
    : "App";
  const resolvedAppId =
    appId ??
    `com.example.${path
      .basename(projectRoot)
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/gu, "-")}`;
  run("cargo", ["run", "--release", "--manifest-path", appCargoManifest], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CARGO_TARGET_DIR:
        process.env.CARGO_TARGET_DIR ?? path.join(desktopRoot, "build/target"),
      RN_GPUI_BUNDLE: bundlePath,
      RN_GPUI_MODULE: module ?? defaultModule ?? "App",
      RN_GPUI_APP_ID: resolvedAppId,
      RN_GPUI_SOURCE_URL: entryFile.replace(/\.[^.]+$/u, ""),
      RN_GPUI_AUTOLINK_MANIFEST: path.join(
        desktopRoot,
        "autolink/autolink.json",
      ),
      RN_GPUI_AUTOLINK_CMAKE: path.join(desktopRoot, "autolink/autolink.cmake"),
    },
  });
}

const appPackageName = (projectRoot, packageJson) =>
  `react-native-gpui-${(packageJson.name ?? path.basename(projectRoot))
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-")}`;

const desktopFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? desktopFiles(fullPath)
      : [path.relative(path.join(templatesDir, "app"), fullPath)];
  });

function scaffoldDesktop(
  projectRoot,
  packageJson,
  { preserveExisting = false, beforeWrite = () => {} } = {},
) {
  const desktopTemplate = path.join(templatesDir, "app/desktop");
  for (const relativePath of desktopFiles(desktopTemplate)) {
    const targetRelativePath =
      relativePath === "desktop/gitignore"
        ? "desktop/.gitignore"
        : relativePath;
    const target = path.join(projectRoot, targetRelativePath);
    if (preserveExisting && fs.existsSync(target)) continue;
    beforeWrite(target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(templatesDir, "app", relativePath), target);
  }

  const cargoPath = path.join(projectRoot, "desktop/Cargo.toml");
  if (!preserveExisting || !fs.existsSync(cargoPath)) {
    beforeWrite(cargoPath);
    fs.writeFileSync(
      cargoPath,
      `[package]\nname = ${JSON.stringify(appPackageName(projectRoot, packageJson))}\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
    );
  }

  const updatedPackageJson = {
    ...packageJson,
    dependencies: {
      ...packageJson.dependencies,
      "react-native-gpui":
        packageJson.dependencies?.["react-native-gpui"] ?? "^0.1.0",
    },
    devDependencies: {
      ...packageJson.devDependencies,
      "@react-native-gpui/cli":
        packageJson.devDependencies?.["@react-native-gpui/cli"] ?? "^0.1.0",
    },
  };
  return updatedPackageJson;
}

export function initDesktop({
  projectRoot = process.cwd(),
  skipInstall = false,
}) {
  projectRoot = path.resolve(projectRoot);
  const snapshots = new Map();
  const createdDirectories = new Set();
  const track = (file) => {
    if (!snapshots.has(file)) {
      snapshots.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
    }
  };
  try {
    const packagePath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(packagePath)) {
      throw new Error(`no package.json found in ${projectRoot}`);
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (
      !packageJson.dependencies?.["react-native"] &&
      !packageJson.devDependencies?.["react-native"]
    ) {
      throw new Error("package.json does not declare react-native");
    }

    const updatedPackageJson = scaffoldDesktop(projectRoot, packageJson, {
      preserveExisting: true,
      beforeWrite(file) {
        track(file);
        let directory = path.dirname(file);
        const missingDirectories = [];
        while (directory.startsWith(projectRoot) && !fs.existsSync(directory)) {
          missingDirectories.push(directory);
          directory = path.dirname(directory);
        }
        missingDirectories.forEach((item) => createdDirectories.add(item));
      },
    });
    track(packagePath);
    fs.writeFileSync(
      packagePath,
      `${JSON.stringify(updatedPackageJson, null, 2)}\n`,
    );

    if (!skipInstall) {
      const manager = fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))
        ? "pnpm"
        : fs.existsSync(path.join(projectRoot, "yarn.lock"))
          ? "yarn"
          : fs.existsSync(path.join(projectRoot, "bun.lockb")) ||
              fs.existsSync(path.join(projectRoot, "bun.lock"))
            ? "bun"
            : "npm";
      for (const lock of [
        "package-lock.json",
        "npm-shrinkwrap.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "bun.lock",
        "bun.lockb",
      ]) {
        const file = path.join(projectRoot, lock);
        track(file);
      }
      run(manager, ["install"], { cwd: projectRoot });
    }
    console.log(
      `Added GPUI desktop support to ${projectRoot}. Run npx react-native run-desktop.`,
    );
  } catch (error) {
    for (const [file, contents] of [...snapshots.entries()].reverse()) {
      if (contents === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, contents);
    }
    for (const directory of [...createdDirectories].sort(
      (left, right) => right.length - left.length,
    )) {
      try {
        fs.rmdirSync(directory);
      } catch {}
    }
    console.error(
      `init-desktop failed and restored its file changes: ${error.message}`,
    );
    console.error("Manual steps to add desktop support:");
    for (const step of [
      "Install react-native-gpui and @react-native-gpui/cli in the app.",
      "Copy the desktop/ scaffold from @react-native-gpui/cli/templates/app/desktop.",
      "Run npm install (or your package manager), then npx react-native run-desktop.",
    ]) {
      console.error(`  - ${step}`);
    }
    throw error;
  }
}

export function initProject({ appName, destination, initArgs = [] }) {
  destination = path.resolve(destination);
  const destinationExisted = fs.existsSync(destination);
  if (destinationExisted && fs.readdirSync(destination).length) {
    throw new Error(`destination is not empty: ${destination}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
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
        ...initArgs,
      ],
      path.dirname(destination),
    );
    const packagePath = path.join(destination, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    fs.writeFileSync(
      packagePath,
      `${JSON.stringify(scaffoldDesktop(destination, packageJson), null, 2)}\n`,
    );
    fs.copyFileSync(
      path.join(templatesDir, "app/App.tsx"),
      path.join(destination, "App.tsx"),
    );
    console.log(
      `Created standard React Native project ${appName} (iOS, Android, and GPUI desktop) in ${destination}. Run npm install, then npx react-native run-desktop.`,
    );
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    if (destinationExisted) fs.mkdirSync(destination, { recursive: true });
    throw error;
  }
}

export function createLibrary({
  libraryName,
  type = "rust",
  destination,
  moduleName: requestedModuleName,
  packageName: requestedPackageName,
}) {
  if (
    !libraryName ||
    !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(libraryName) ||
    !["rust", "cpp"].includes(type)
  ) {
    throw new Error(
      "create-library requires a valid name and rust or cpp type",
    );
  }
  destination = path.resolve(destination ?? libraryName);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
    throw new Error(`destination is not empty: ${destination}`);
  }
  const slug = libraryName
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-");
  const words = libraryName.match(/[A-Z]?[a-z0-9]+|[A-Z]+/gu) ?? [libraryName];
  const moduleStem = words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  const moduleName = requestedModuleName ?? `RN${moduleStem}Module`;
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(moduleName)) {
    throw new Error("--module-name must be a PascalCase identifier");
  }
  const specName = `Native${moduleStem}`;
  const cppProvider = `create_${slug.replaceAll("-", "_")}_module`;
  const packageName = requestedPackageName ?? `react-native-${slug}`;
  const templateRoot = path.join(templatesDir, `modules/${type}`);
  fs.mkdirSync(destination, { recursive: true });
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
    const contents = fs
      .readFileSync(path.join(templateRoot, source), "utf8")
      .replaceAll("NativeModule", specName)
      .replaceAll("RNMODULE", moduleName.toUpperCase())
      .replaceAll("RNModule", moduleName)
      .replaceAll("create_rn_module", cppProvider);
    fs.writeFileSync(targetPath, contents);
  }

  const platformConfig =
    type === "rust"
      ? { crate: `rn-gpui-${slug}` }
      : { cmake: "gpui", cppProvider };
  const packageJson = {
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
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(destination, "react-native.config.js"),
    [
      "module.exports = {",
      "  dependency: {",
      "    platforms: {",
      "      gpui: {",
      ...Object.entries(platformConfig).map(
        ([key, value]) => `        ${key}: ${JSON.stringify(value)},`,
      ),
      "      },",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"),
  );
  if (type === "rust") {
    const appRequire = createRequire(path.join(process.cwd(), "package.json"));
    const platformPackageJson = appRequire.resolve(
      "react-native-gpui/package.json",
    );
    const macrosPath = path.relative(
      path.join(destination, "gpui"),
      path.join(path.dirname(platformPackageJson), "ReactGpui/rn-gpui-macros"),
    );
    fs.writeFileSync(
      path.join(destination, "gpui/Cargo.toml"),
      `[package]\nname = ${JSON.stringify(`rn-gpui-${slug}`)}\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nrn-gpui-macros = { path = ${JSON.stringify(macrosPath)} }\n`,
    );
  }
  const language = type === "rust" ? "Rust" : "C++";
  const implementation =
    type === "rust" ? "gpui/src/lib.rs" : `gpui/cpp/${moduleName}.cpp`;
  const description =
    type === "rust"
      ? "call its typed greet(name) method."
      : "implement methods defined by its generated spec.";
  fs.writeFileSync(
    path.join(destination, "README.md"),
    `# ${libraryName}\n\n${language} TurboModule library for React Native GPUI. The spec is in src/${specName}.ts and uses React Native's public TurboModuleRegistry API. The implementation is in ${implementation} and is discovered through package metadata. Import the default export from ${packageName} and ${description}\n`,
  );
  console.log(
    `Created ${type} TurboModule library ${packageName} in ${destination}. Install/link it in a React Native app, then run npx react-native run-desktop.`,
  );
}
