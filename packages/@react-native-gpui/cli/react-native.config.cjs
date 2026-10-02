const { execFileSync } = require("node:child_process");
const path = require("node:path");

const bin = path.join(__dirname, "bin/react-native-gpui.js");

module.exports = {
  commands: [
    {
      name: "run-desktop",
      description: "Build and launch the GPUI desktop target",
      func: async (_argv, _config, options) => {
        const args = ["run"];
        for (const [key, flag] of [
          ["entryFile", "--entry-file"],
          ["module", "--module"],
          ["appId", "--app-id"],
          ["bundle", "--bundle"],
        ]) {
          if (options[key] !== undefined) args.push(flag, String(options[key]));
        }
        execFileSync(process.execPath, [bin, ...args], { stdio: "inherit" });
      },
      options: [
        { name: "--entry-file <path>", description: "Application entry file" },
        {
          name: "--module <name>",
          description: "React Native root module name",
        },
        {
          name: "--app-id <id>",
          description: "Desktop application identifier",
        },
        { name: "--bundle <path>", description: "Bundle output path" },
      ],
      examples: [
        { desc: "Run the desktop target", cmd: "npx react-native run-desktop" },
      ],
    },
    {
      name: "init-desktop",
      description: "Add GPUI desktop support to an existing React Native app",
      func: async (_argv, _config, options) => {
        const args = ["init-desktop"];
        if (options.projectRoot)
          args.push("--project-root", options.projectRoot);
        if (options.skipInstall) args.push("--skip-install");
        execFileSync(process.execPath, [bin, ...args], { stdio: "inherit" });
      },
      options: [
        {
          name: "--project-root <path>",
          description: "React Native project directory",
        },
        {
          name: "--skip-install",
          description: "Write the scaffold without installing packages",
        },
      ],
      examples: [
        {
          desc: "Add desktop support to this app",
          cmd: "npx react-native init-desktop",
        },
      ],
    },
    {
      name: "create-library <name>",
      description: "Create a GPUI TurboModule library in a new directory",
      func: async (argv, _config, options) => {
        const args = ["create-library", ...argv];
        if (options.type) args.push("--type", options.type);
        if (options.directory) args.push("--directory", options.directory);
        if (options.moduleName) args.push("--module-name", options.moduleName);
        if (options.packageName)
          args.push("--package-name", options.packageName);
        execFileSync(process.execPath, [bin, ...args], { stdio: "inherit" });
      },
      options: [
        {
          name: "--type <rust|cpp>",
          description: "Native implementation language (default: rust)",
        },
        { name: "--directory <path>", description: "Output directory" },
        {
          name: "--module-name <name>",
          description: "Native TurboModule name",
        },
        { name: "--package-name <name>", description: "npm package name" },
      ],
      examples: [
        {
          desc: "Create a Rust TurboModule package",
          cmd: "npx react-native create-library AwesomeStorage",
        },
        {
          desc: "Create a C++ TurboModule package",
          cmd: "npx react-native create-library AwesomeStorage --type cpp",
        },
      ],
    },
  ],
};
