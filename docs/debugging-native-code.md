---
id: debugging-native-code
title: Debugging Native Code
---

When you write a [native module](turbo-native-modules) or a [host component](fabric-native-components), you debug Rust or C++ code that runs inside the app's process. This page covers logging, and attaching a native debugger.

## Accessing Logs

The app writes its logs to the terminal where you ran `run-desktop`. JavaScript `console` calls, React Native's own messages and your native logs all end up there.

The log level is controlled with the `RUST_LOG` environment variable, and defaults to `info`:

```shell
RUST_LOG=debug npx react-native run-desktop
RUST_LOG=my_module=trace,info npx react-native run-desktop   # trace one module only
```

<details>
<summary>**💡 Custom Native Logs**</summary>

If you are writing a native module and want to add custom logs to your module for debugging purposes:

#### Rust

Use the `log` crate, as the platform does:

```rust
log::info!("[my-module] opened {}", path);
log::error!("[my-module] failed: {error}");
```

Add `log = "0.4"` to the crate's `Cargo.toml`.

#### C++

Use `glog`, which React Native's C++ code already uses:

```cpp
LOG(INFO) << "[MyModule] opened " << path;
```

</details>

## Debugging in a Native IDE

Debug builds are built with line tables, so a debugger can show source lines. For full variable information, build with full debug info:

```shell
CARGO_PROFILE_DEV_DEBUG=full npx react-native run-desktop
```

Run the app with `run-desktop`, and attach the native debugger of your platform to the process:

| Platform | Debugger                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | LLDB, from the terminal (`lldb -p <pid>`), from VS Code with [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb), or from Xcode with **Debug > Attach to Process**. |
| Windows  | Visual Studio with **Debug > Attach to Process**, or VS Code with the C++ and Rust extensions.                                                                                                      |
| Linux    | GDB or LLDB (`gdb -p <pid>`), or VS Code with CodeLLDB.                                                                                                                                             |

The process is named after your app. Set breakpoints in the Rust or C++ sources of your module, and trigger the code from JavaScript.

### Panics

A panic in a Rust module method does not stop the app. It is caught and turned into a rejected promise or a thrown error, and the panic message is logged. To stop in the debugger at the panic, set a breakpoint on `rust_panic`.

## JavaScript and native together

Native debugging and [React Native DevTools](https://reactnative.dev/docs/0.87/react-native-devtools) can run at the same time. Use DevTools for the JavaScript side of a call, and the native debugger for the Rust or C++ side.
