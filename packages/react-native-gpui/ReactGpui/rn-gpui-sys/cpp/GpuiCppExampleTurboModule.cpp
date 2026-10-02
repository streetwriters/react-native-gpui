#include "GpuiCppExampleTurboModule.h"

#include <ReactCommon/TurboModule.h>

#include <string>
#include <utility>

namespace rngpui {
namespace jsi = facebook::jsi;
using facebook::react::CallInvoker;
using facebook::react::TurboModule;

namespace {

class CppExampleTurboModule final : public TurboModule {
 public:
  explicit CppExampleTurboModule(std::shared_ptr<CallInvoker> jsInvoker)
      : TurboModule("NativeCppExample", std::move(jsInvoker)) {
    methodMap_.emplace("greet", MethodMetadata{1, &greet});
  }

 private:
  static jsi::Value greet(
      jsi::Runtime& runtime,
      TurboModule& /*base*/,
      const jsi::Value* args,
      size_t count) {
    if (count != 1 || !args[0].isString()) {
      throw jsi::JSError(runtime, "NativeCppExample.greet expects one string");
    }
    const auto name = args[0].asString(runtime).utf8(runtime);
    return jsi::String::createFromUtf8(runtime, "Hello from C++, " + name + "!");
  }
};

} // namespace

std::shared_ptr<TurboModule> make_cpp_example_turbo_module(
    std::shared_ptr<CallInvoker> jsInvoker) {
  return std::make_shared<CppExampleTurboModule>(std::move(jsInvoker));
}

} // namespace rngpui
