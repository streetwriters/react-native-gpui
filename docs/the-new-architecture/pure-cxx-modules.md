---
id: pure-cxx-modules
title: 'Native Modules: C++'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

C++ is a good choice for a module when the code already exists in C++, or when it is shared with iOS and Android. On desktop, a C++ module is the same TurboModule as on mobile: a class that derives from a generated spec.

This page is the reference for C++ modules. For a first module, start with the [introduction](../turbo-native-modules).

## A C++ module is a library

A C++ module lives in a library, which you create with the CLI:

```shell
npx react-native create-library AwesomeStorage --type cpp
```

It writes:

| File                                                | Purpose                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `src/NativeAwesomeStorage.ts`                       | The TypeScript specification.                                |
| `desktop/cpp/RNAwesomeStorageModule.hpp` and `.cpp` | The implementation, and the function that creates it.        |
| `desktop/CMakeLists.txt`                            | Adds the sources to the app.                                 |
| `react-native.config.js`                            | Declares `platforms.desktop` with `cmake` and `cppProvider`. |
| `package.json`                                      | The `codegenConfig` that Codegen reads.                      |

```js title="react-native.config.js"
module.exports = {
  dependency: {
    platforms: {
      desktop: {
        cmake: 'desktop',
        cppProvider: 'create_awesome_storage_module',
      },
    },
  },
};
```

`cmake` is the folder with the `CMakeLists.txt`, and `cppProvider` is the C++ function that creates the module.

## The generated spec class

When the app builds, autolinking runs React Native Codegen over the library's specifications and writes `<codegenConfig.name>JSI.h` and `<codegenConfig.name>.h` under `desktop/autolink/codegen/`. The second header declares one spec class per specification file: `src/NativeGreeting.ts` defines `NativeGreetingSpec`.

Derive from it, passing the implementation class as the template argument:

```cpp
class RNModule final : public facebook::react::NativeModuleSpec<RNModule> {
 public:
  explicit RNModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeModuleSpec(std::move(jsInvoker)) {}

  std::string greet(jsi::Runtime&, std::string name) {
    return "Hello from C++, " + name + "!";
  }
};
```

and return it from the provider function:

```cpp
std::shared_ptr<TurboModule> create_awesome_storage_module(
    const std::string& name,
    std::shared_ptr<CallInvoker> jsInvoker) {
  return rngpui::provideTurboModule<RNModule>(name, std::move(jsInvoker));
}
```

## Types

React Native's bridging converts arguments and results, so declare the C++ type the specification maps to:

| Spec type                          | C++ type                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `string`                           | `std::string`                                                           |
| `number`, `Double`, `Float`        | `double`                                                                |
| `Int32`                            | `int32_t`                                                               |
| `boolean`                          | `bool`                                                                  |
| `T \| null`, an optional parameter | `std::optional<T>`                                                      |
| `Array<T>`                         | `std::vector<T>`                                                        |
| `Object`, an object type           | `folly::dynamic`; a named object type uses the struct Codegen generates |
| `ArrayBuffer`                      | `std::vector<uint8_t>`                                                  |
| A callback                         | `rngpui::Callback<...>`                                                 |
| An enum or literal union           | `std::string` or `double`                                               |

A signature that disagrees with the specification fails to compile.

## Threads

How a method is declared in the specification decides where it runs:

| Spec return type | C++ method                                       | Runs on               |
| ---------------- | ------------------------------------------------ | --------------------- |
| A value          | `T name(jsi::Runtime&, args...)`                 | The JavaScript thread |
| `void`           | `void name(args...)`                             | The module's thread   |
| `Promise<T>`     | `void name(args..., rngpui::Promise<T> promise)` | The module's thread   |

A method that does not run on the JavaScript thread cannot take a JSI type, because JSI values belong to the runtime's thread.

To choose another thread, add a public constant to the class. It must be public, because the generated spec class reads `T::kThread`:

```cpp
class RNModule final : public facebook::react::NativeModuleSpec<RNModule> {
 public:
  static constexpr rngpui::ModuleThread kThread = rngpui::ModuleThread::Main;
  // ...
};
```

| Value                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `ModuleThread::Own`  | A thread owned by the module. The default.                                    |
| `ModuleThread::Main` | The GPUI main thread, for window and UI work.                                 |
| `ModuleThread::JS`   | Inline on the JavaScript thread. The method then takes `jsi::Runtime&` first. |

`rngpui::dispatchMain(task)` runs a function on the main thread from anywhere.

## Promises

A `Promise<T>` method receives a promise, which may be settled from any thread. Only the first settlement counts:

```cpp
void getLength(std::string text, rngpui::Promise<double> promise) {
  promise.resolve(static_cast<double>(text.size()));
}

void fail(rngpui::Promise<void> promise) {
  promise.reject("ENOENT", "no such file"); // a code and a message
}
```

## Events

A spec that declares `readonly onProgress: CodegenTypes.EventEmitter<number>` generates a protected `emitOnProgress(value)` on the spec class. Any thread may call it. For a module used through `NativeEventEmitter`, `sendEvent("name", body)` does the same.

## Calling the operating system

C++ code runs in the same process as the app, so it calls the operating system's APIs directly: Cocoa from an Objective-C++ file on macOS, Win32 on Windows, and POSIX or a C library on Linux. Guard platform code with the usual `#if defined(__APPLE__)`, `_WIN32` and `__linux__` checks, and add the right system libraries in `CMakeLists.txt`.

## Sharing code with iOS and Android

A library with C++ code can serve all three. The portable core stays as it is for the mobile platforms, and the `desktop/` folder holds the desktop entry point. Declare the library's iOS and Android support as you do today; `platforms.desktop` is the desktop addition.
