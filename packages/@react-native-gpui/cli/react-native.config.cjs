module.exports = {
  commands: [
    {
      name: "run-desktop",
      description:
        "Run the GPUI desktop target with Metro or as a release build",
      func: async (_argv, _config, options) => {
        const { runDesktop } = await import("./src/commands.js");
        await runDesktop({
          projectRoot: options.projectRoot,
          entryFile: options.entryFile,
          bundle: options.bundle,
          config: options.config,
          release: options.release,
          port: options.port,
          host: options.host,
        });
      },
      options: [
        { name: "--entry-file <path>", description: "Application entry file" },
        {
          name: "--release",
          description: "Bundle JavaScript and build the optimized app",
        },
        {
          name: "--port <number>",
          description: "Metro server port (default: 8081)",
        },
        {
          name: "--host <host>",
          description: "Metro server host (default: localhost)",
        },
        { name: "--config <path>", description: "Metro configuration file" },
        { name: "--bundle <path>", description: "Bundle output path" },
      ],
      examples: [
        {
          desc: "Run with Metro and Fast Refresh",
          cmd: "npx react-native run-desktop",
        },
        {
          desc: "Build a bundled release",
          cmd: "npx react-native run-desktop --release",
        },
      ],
    },
    {
      name: "init-desktop",
      description: "Add GPUI desktop support to an existing React Native app",
      func: async (_argv, _config, options) => {
        const { initDesktop } = await import("./src/commands.js");
        initDesktop({
          projectRoot: options.projectRoot,
          skipInstall: options.skipInstall,
        });
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
        const { createLibrary } = await import("./src/commands.js");
        createLibrary({
          libraryName: argv[0],
          type: options.type,
          destination: options.directory,
          moduleName: options.moduleName,
          packageName: options.packageName,
        });
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
