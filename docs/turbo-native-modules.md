---
id: turbo-native-modules
title: 'Native Modules: Introduction'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Native Modules

Your app may need to call operating-system APIs that React Native does not provide. You can write the integration yourself with a **Turbo Native Module**. This guide builds one, in Rust or in C++.

The steps are:

1. **define a typed specification** in TypeScript or Flow;
2. **let Codegen turn the specification into native interfaces**;
3. **write your app code** against the specification; and
4. **implement the generated interface** in native code.

We will build a small `NativeLocalStorage` module that keeps strings by key.

## 1. Define the specification

The specification is a TypeScript file whose name starts with `Native`. It describes what JavaScript can call, with React Native's own types:

```ts title="NativeLocalStorage.ts"
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setItem(value: string, key: string): void;
  getItem(key: string): string | null;
  removeItem(key: string): void;
  clear(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeLocalStorage');
```

The string passed to `getEnforcing` is the name of the module. [Rust modules](native-modules-rust#types) lists how each spec type maps to Rust, and [C++ modules](the-new-architecture/pure-cxx-modules#types) lists the C++ types.

## 2. Where the code lives

A module lives either in your app, or in a library that other apps install.

<Tabs groupId="where" queryString defaultValue="app" values={[{label: 'In your app', value: 'app'}, {label: 'In a library', value: 'library'}]}>
<TabItem value="app">

Put the specification and the implementation in your app's `desktop/` folder, and list the specification in `desktop/build.rs`, so that Codegen runs for it:

```rust title="desktop/build.rs"
fn main() {
    rn_gpui_module_build::generate(&["src/NativeLocalStorage.ts"]);
    // ... the lines the template already has
}
```

Rust is the language for modules inside an app. For C++, write a library.

</TabItem>
<TabItem value="library">

Create a library with the CLI. It writes the layout, the `package.json` and the `react-native.config.js` for you:

```shell
npx react-native create-library AwesomeStorage            # Rust
npx react-native create-library AwesomeStorage --type cpp # C++
```

The specification goes in `src/`, and the native code in `desktop/`. See [Create a library](the-new-architecture/create-module-library).

</TabItem>
</Tabs>

## 3. Use the module in JavaScript

The default export of the specification is the module, so import it like any module:

```tsx title="App.tsx"
import React from 'react';
import { Button, Text, View } from 'react-native';
import NativeLocalStorage from './desktop/src/NativeLocalStorage';

export default function App() {
  const [value, setValue] = React.useState<string | null>(null);
  return (
    <View>
      <Button
        title="Save"
        onPress={() => {
          NativeLocalStorage.setItem('hello', 'greeting');
          setValue(NativeLocalStorage.getItem('greeting'));
        }}
      />
      <Text>{value ?? 'Nothing saved yet'}</Text>
    </View>
  );
}
```

For a library the import is the library's package name.

## 4. Implement the module

Codegen turns the specification into a trait (Rust) or a base class (C++) named after the file, here `NativeLocalStorageSpec`. Your code implements it, so a mistake against the specification is a compile error, and not a surprise at run time.

<Tabs groupId="language" queryString defaultValue="rust" values={[{label: 'Rust', value: 'rust'}, {label: 'C++', value: 'cpp'}]}>
<TabItem value="rust">

```rust title="desktop/src/local_storage.rs"
use std::collections::HashMap;
use std::sync::Mutex;

use rn_gpui_module::ModuleError;

use crate::{NativeLocalStorageEvents, NativeLocalStorageSpec};

#[derive(Default)]
pub struct LocalStorage {
    items: Mutex<HashMap<String, String>>,
}

impl NativeLocalStorageSpec for LocalStorage {
    fn new(_events: NativeLocalStorageEvents) -> Self {
        Self::default()
    }

    fn set_item(&self, value: String, key: String) {
        self.items.lock().unwrap().insert(key, value);
    }

    fn get_item(&self, key: String) -> Result<Option<String>, ModuleError> {
        Ok(self.items.lock().unwrap().get(&key).cloned())
    }

    fn remove_item(&self, key: String) {
        self.items.lock().unwrap().remove(&key);
    }

    fn clear(&self) {
        self.items.lock().unwrap().clear();
    }
}
```

`include_specs!()` in `main.rs` (or `lib.rs`, in a library) pulls in the generated trait, the events handle and the value types:

```rust title="desktop/src/main.rs"
rn_gpui_module::include_specs!();

mod local_storage;
use local_storage::LocalStorage;

fn main() {
    // App-local modules are registered before the app starts.
    react_native_gpui::register_module(native_local_storage_module::<LocalStorage>());
    // ... the rest of the template's main
}
```

A library registers its modules in a function called `rn_gpui_register`, which autolinking calls. See [Create a library](the-new-architecture/create-module-library).

</TabItem>
<TabItem value="cpp">

A C++ module derives from the generated spec class and declares one method per spec method. React Native's bridging converts the arguments, so a signature that disagrees with the specification does not compile:

```cpp title="desktop/cpp/RNLocalStorage.cpp"
#include "RNLocalStorage.hpp"

#include <RNLocalStorageSpec.h>

#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>

namespace {
namespace jsi = facebook::jsi;
using facebook::react::CallInvoker;
using facebook::react::TurboModule;

class RNLocalStorage final
    : public facebook::react::NativeLocalStorageSpec<RNLocalStorage> {
 public:
  explicit RNLocalStorage(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeLocalStorageSpec(std::move(jsInvoker)) {}

  void setItem(std::string value, std::string key) {
    std::lock_guard<std::mutex> lock(mutex_);
    items_[key] = std::move(value);
  }

  std::optional<std::string> getItem(jsi::Runtime&, std::string key) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto found = items_.find(key);
    return found == items_.end() ? std::nullopt
                                 : std::optional<std::string>(found->second);
  }

  void removeItem(std::string key) {
    std::lock_guard<std::mutex> lock(mutex_);
    items_.erase(key);
  }

  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    items_.clear();
  }

 private:
  std::mutex mutex_;
  std::map<std::string, std::string> items_;
};
} // namespace

std::shared_ptr<TurboModule> create_awesome_storage_module(
    const std::string& name,
    std::shared_ptr<CallInvoker> jsInvoker) {
  return rngpui::provideTurboModule<RNLocalStorage>(name, std::move(jsInvoker));
}
```

A method that returns a value takes `jsi::Runtime&` first and runs on the JavaScript thread. A method that returns `void`, or a `Promise` in the specification, runs on a thread of its own, so it does not block JavaScript. See [C++ modules](the-new-architecture/pure-cxx-modules#threads).

</TabItem>
</Tabs>

## Run it

```shell
npx react-native run-desktop
```

Codegen runs as part of the build, the module is compiled into the app, and `NativeLocalStorage` is available to JavaScript.

## Next steps

- [Rust modules](native-modules-rust): asynchronous methods, objects, errors and events.
- [C++ modules](the-new-architecture/pure-cxx-modules)
- [Create a library](the-new-architecture/create-module-library) so other apps can install your module.
