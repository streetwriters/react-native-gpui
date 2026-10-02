#include "NativeCppExampleModule.hpp"

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include <utility>

namespace {
namespace jsi = facebook::jsi;
using facebook::react::CallInvoker;
using facebook::react::TurboModule;

class NativeCppExampleModule final : public TurboModule {
 public:
  explicit NativeCppExampleModule(std::shared_ptr<CallInvoker> jsInvoker)
      : TurboModule("NativeCppExample", std::move(jsInvoker)) {
    methodMap_.emplace("greet", MethodMetadata{1, &greet});
  }

 private:
  static jsi::Value greet(
      jsi::Runtime& runtime,
      TurboModule&,
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

std::shared_ptr<TurboModule> create_cpp_example_module(
    const std::string& name,
    std::shared_ptr<CallInvoker> jsInvoker) {
  if (name != "NativeCppExample") return nullptr;
  return std::make_shared<NativeCppExampleModule>(std::move(jsInvoker));
}
