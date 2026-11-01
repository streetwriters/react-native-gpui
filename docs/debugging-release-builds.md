---
id: debugging-release-builds
title: Debugging Release Builds
---

## Symbolicating a stack trace

If a React Native app throws an unhandled exception in a release build, the output may be obfuscated and hard to read. A release build ships the JavaScript minified, and compiled to bytecode by the engine.

```shell
Error: Failed, js engine: hermes, stack:
p@1:132161
p@1:132084
f@1:131854
anonymous@1:131119
```

In the above stack trace, entries like `p@1:132161` are minified function names and bytecode offsets. To debug these calls, we want to translate these into file, line, and function name, e.g. `AwesomeProject/App.tsx:54:initializeMap`. This is known as **symbolication.**

You can symbolicate minified function names and bytecode like the above by passing the stack trace and a generated source map to [`metro-symbolicate`](https://www.npmjs.com/package/metro-symbolicate).

### Generating source maps

`run-desktop --release` and `package-desktop` do not write a source map. To get one for the bundle that you ship, build the bundle yourself with the same options, and ask Metro for a map:

```shell
npx react-native bundle \
  --platform desktop \
  --entry-file index.js \
  --config desktop/metro.config.js \
  --bundle-output build/index.bundle \
  --sourcemap-output build/index.bundle.map \
  --dev false
```

:::note
The map must come from the exact commit that you shipped, and must be built the same way. Keep the map of every release, next to the installer.
:::

### Bytecode

The release bundle is compiled by the JavaScript engine's compiler. Hermes' compiler writes bytecode offsets, not line numbers. To translate them, give `metro-symbolicate` a source map that has been composed with the compiler's own source map. Build the bytecode with a source map, with `hermesc -emit-binary -O -output-source-map -source-map <metro map>`, and use the composed map that React Native's `compose-source-maps.js` script produces.

### Using `metro-symbolicate`

With source maps being generated, we can now translate our stack traces.

```shell
# Print usage instructions
npx metro-symbolicate

# From a file containing the stack trace
npx metro-symbolicate build/index.bundle.map < stacktrace.txt
```

### Notes on source maps

- Make sure that the source map you use corresponds to the exact commit of the crashing app. Small changes in source code can cause large differences in offsets.
- If `metro-symbolicate` exits immediately with success, make sure the input comes from a pipe or redirection and not from a terminal.
