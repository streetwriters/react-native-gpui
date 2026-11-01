---
id: codegen-cli
title: The Codegen CLI
---

On desktop, Codegen runs as part of [autolinking](../autolinking). You can run autolinking on its own to see what is generated, without building the app:

```shell
npx react-native-gpui autolink
```

It reads your app's `package.json` and the `codegenConfig` of every dependency that supports desktop, runs React Native's Codegen and the generators of react-native-gpui, and writes the result under `desktop/autolink/`:

| Path                                  | Contents                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `desktop/autolink/codegen/<Library>/` | The C++ props, shadow nodes, descriptors and TurboModule specs that React Native's Codegen writes. |
| `desktop/autolink/autolink.json`      | The manifest of what was linked, including the installed JavaScript engines.                       |

The generated Rust code of a native module is written into the crate's build output by `rn-gpui-module-build`, from `build.rs`. Run `cargo build` in the `desktop/` folder, or `run-desktop`, and open the `out` folder of the crate under `desktop/build/target` to read it.

`desktop/autolink/` is generated and git-ignored. Look at it to see which interfaces you need to implement, and do not edit it.

## React Native's Codegen CLI

React Native's own Codegen CLI, `npx @react-native-community/cli codegen`, generates code for iOS and Android. It is the right tool to inspect the code of those platforms, and does not generate the desktop code.

## Libraries

A library does not include its generated code. The app that installs it runs Codegen when it builds. This keeps the generated code in step with the React Native version that the app uses. The `includesGeneratedCode` option of React Native's `codegenConfig` is not used on desktop.
