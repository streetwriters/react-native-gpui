#include "GpuiExtensions.h"
#include "RustTurboModules.generated.hpp"

#include <react/nativemodule/core/ReactCommon/TurboModuleUtils.h>

#include <string>

namespace rngpui {
using namespace facebook::react;

namespace {
namespace jsi = facebook::jsi;

class RustStringTurboModule final : public TurboModule {
 public:
  using StringMethod = char* (*)(const char*);
  using StringFree = void (*)(char*);

  RustStringTurboModule(
      const char* moduleName,
      std::shared_ptr<CallInvoker> jsInvoker,
      const char* methodName,
      StringMethod method,
      StringFree freeString)
      : TurboModule(moduleName, std::move(jsInvoker)),
        method_(method),
        freeString_(freeString) {
    methodMap_.emplace(methodName, MethodMetadata{1, &invokeString});
  }

 private:
  static jsi::Value invokeString(
      jsi::Runtime& runtime,
      TurboModule& base,
      const jsi::Value* args,
      size_t count) {
    if (count != 1 || !args[0].isString()) {
      throw jsi::JSError(runtime, "Rust TurboModule method expects one string");
    }
    auto& self = static_cast<RustStringTurboModule&>(base);
    const auto input = args[0].asString(runtime).utf8(runtime);
    auto* raw = self.method_(input.c_str());
    if (!raw) {
      return jsi::String::createFromUtf8(runtime, "");
    }
    std::string result(raw);
    self.freeString_(raw);
    return jsi::String::createFromUtf8(runtime, result);
  }

  StringMethod method_;
  StringFree freeString_;
};

} // namespace

void rn_gpui_install_rust_turbo_modules_extension() {
  gpuiExtensionHooks().turboModules.push_back(
      [](const std::string& name, const std::shared_ptr<CallInvoker>& jsInvoker)
          -> std::shared_ptr<TurboModule> {
#define RN_GPUI_REGISTER_RUST_STRING_MODULE(                                \
    module_name_fn, method_name_fn, method_fn, free_fn)                     \
  if (name == module_name_fn()) {                                           \
    return std::make_shared<RustStringTurboModule>(                         \
        module_name_fn(), jsInvoker, method_name_fn(), method_fn, free_fn); \
  }
        RN_GPUI_RUST_TURBO_MODULES(RN_GPUI_REGISTER_RUST_STRING_MODULE)
#undef RN_GPUI_REGISTER_RUST_STRING_MODULE
        return nullptr;
      });
}

} // namespace rngpui
