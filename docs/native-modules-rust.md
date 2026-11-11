---
id: native-modules-rust
title: 'Native Modules: Rust'
---

A Rust module implements a trait that Codegen generates from a TypeScript specification. This page is the reference for that trait: how types map, where methods run, and how to report errors and events. For a first module, start with the [introduction](turbo-native-modules).

A Rust module depends on two crates:

```toml title="desktop/Cargo.toml"
[dependencies]
rn-gpui-module = "0.1"

[build-dependencies]
rn-gpui-module-build = "0.1"
```

`rn-gpui-module` is the runtime the generated code is written against, and `rn-gpui-module-build` runs the generator from `build.rs`:

```rust title="desktop/build.rs"
fn main() {
    rn_gpui_module_build::generate(&["../src/NativeFs.ts"]);
}
```

The paths are relative to the `desktop/` folder. Depend on these crates by **version**, never by path or git: autolinking points them at the copy installed with `@react-native-gpui/core`.

### GPUI Kit

A module crate may depend on GPUI Kit from crates.io (`gpui-base`, `gpui-component`, `gpui-kit-assets` or another `gpui-kit*` or `gpui-pre*` crate) by version. The kit is published against `gpui-pre`, so autolinking adds `gpui-pre`, `gpui-pre-macros` and `gpui-pre-sum-tree` to the managed `[patch.crates-io]` table of the app, pointing at the same gpui-fast revision as core's `gpui`. `gpui-pre-platform`, `gpui-pre-web` and `gpui-pre-reqwest-client` are added when a module names them or the app's `Cargo.lock` already has them. An app with no module that depends on the kit gets none of these, and a hand-written line for one of them in `[patch.crates-io]` is an error: remove it and let autolinking write it.

## The generated code

`rn_gpui_module::include_specs!();` includes what the generator wrote into your crate:

- a trait `Native<Name>Spec` with one method per spec method, and a `new(events)` constructor;
- a struct `Native<Name>Events` with a method per event the spec declares;
- a struct or enum for every named object type and enum in the spec;
- a function `native_<name>_module::<YourType>()` that returns the module's descriptor, to register.

Method names are converted to `snake_case`: `readFile` becomes `read_file`. Names that are Rust keywords are written as raw identifiers (`r#match`).

## Types

| Spec type                                      | Rust type                                            |
| ---------------------------------------------- | ---------------------------------------------------- |
| `string`                                       | `String`                                             |
| `number`, `Double`, `Float`                    | `f64`                                                |
| `Int32`                                        | `i32`                                                |
| `boolean`                                      | `bool`                                               |
| `T \| null`, an optional property or parameter | `Option<T>`                                          |
| `Array<T>`, `ReadonlyArray<T>`                 | `Vec<T>`                                             |
| A named object type, or an inline object       | A generated struct, with `FromValue` and `IntoValue` |
| A TypeScript `enum`                            | A generated enum                                     |
| A union of string or number literals           | A generated enum                                     |
| `Object`, `UnsafeObject`                       | `Value`, an untyped JavaScript value                 |
| `ArrayBuffer`                                  | `ArrayBuffer`, the bytes of the buffer               |
| A callback parameter                           | `Box<dyn FnOnce(...) + Send>`                        |

`Value` is a JavaScript value detached from the runtime: `Null`, `Bool`, `Number`, `String`, `Buffer`, `Array`, `Object` or `Callback`. Types you define implement `FromValue` and `IntoValue`, and so can your own.

A conversion error names where it happened, for example `NativeFixture.summarize: argument 1 (options).label`, and reaches JavaScript as an error.

## Methods and threads

How a method is declared in the specification decides where it runs:

| Spec return type | Rust method                                                 | Runs on               |
| ---------------- | ----------------------------------------------------------- | --------------------- |
| A value          | `fn name(&self, ...) -> Result<T, ModuleError>`             | The JavaScript thread |
| `void`           | `fn name(&self, ...)`                                       | The module's thread   |
| `Promise<T>`     | `async fn name(&self, ...) -> Result<T, ModuleError>`       | The module's thread   |
| A callback       | `fn name(&self, ..., callback: Box<dyn FnOnce(..) + Send>)` | The module's thread   |

A method that returns a value blocks JavaScript until it finishes, so keep it quick. Anything slow should return a `Promise`, which runs on a thread of its own and does not block JavaScript:

```rust
async fn read_text_file(&self, path: String) -> Result<String, ModuleError> {
    // ...
}
```

By default a module has its own thread. To run its `void` and `Promise` methods on the GPUI main thread instead, which window and UI work requires, set the constant on the implementation:

```rust
impl NativeShellSpec for Shell {
    const THREAD: ModuleThread = ModuleThread::Main;
    // ...
}
```

The two choices are `ModuleThread::Own` and `ModuleThread::Main`.

## Errors

Return a `ModuleError` to reject a promise, or to throw from a value method. The message reaches JavaScript as the error's `message`, and the optional code as its `code`:

```rust
use rn_gpui_module::ModuleError;

Err(ModuleError::with_code("ENOENT", "no such file"))
Err(ModuleError::new("something went wrong"))
Err("something went wrong".into())
```

A panic in a module method does not take the app down: it is caught and turned into a rejection.

## Events

A spec that declares `CodegenTypes.EventEmitter` members:

```ts
readonly onProgress: CodegenTypes.EventEmitter<number>;
readonly onDone: CodegenTypes.EventEmitter<void>;
```

gets a method per event on the events handle passed to `new`. Keep the handle, and call it from any thread:

```rust
struct Download {
    events: NativeDownloadEvents,
}

impl NativeDownloadSpec for Download {
    fn new(events: NativeDownloadEvents) -> Self {
        Self { events }
    }

    fn start(&self, steps: f64) {
        for step in 0..steps as u64 {
            self.events.on_progress(step as f64);
        }
        self.events.on_done();
    }
}
```

JavaScript subscribes to the event on the module object:

```ts
const subscription = NativeDownload.onProgress(step => console.log(step));
subscription.remove();
```

For a module used through `NativeEventEmitter`, the events handle also has `send_event(name, body)`, and the specification declares `addListener` and `removeListeners`.

## Registering

An app registers the modules it owns in `main`, before `run_with`:

```rust
react_native_gpui::register_module(native_greeting_module::<Greeting>());
```

Registering a name twice panics, so a module that the platform already provides cannot be registered again. A library registers its modules in a function named `rn_gpui_register` instead, which autolinking calls.

## Callbacks and async work

A callback may be called once, from any thread. For work that finishes later, prefer a `Promise`: it is easier to use from JavaScript and carries errors.

## Native modules in the platform

The desktop shell itself is built from the same modules: windows, menus and the tray are Rust modules, so their source is a good reference. [react-native-gpui-modules](https://github.com/streetwriters/react-native-gpui-modules) holds more, including larger modules split across files by concern.
