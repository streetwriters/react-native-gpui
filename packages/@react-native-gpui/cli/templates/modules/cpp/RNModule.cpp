#include "RNModule.hpp"

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include <utility>

namespace {
namespace jsi = facebook::jsi;
using facebook::react::CallInvoker;
using facebook::react::TurboModule;

class RNModule final : public TurboModule {
 public:
  explicit RNModule(std::shared_ptr<CallInvoker> jsInvoker)
      : TurboModule("RNModule", std::move(jsInvoker)) {
    methodMap_.emplace("greet", MethodMetadata{1, &greet});
  }

 private:
  static jsi::Value greet(
      jsi::Runtime& runtime,
      TurboModule&,
      const jsi::Value* args,
      size_t count) {
    if (count != 1 || !args[0].isString()) {
      throw jsi::JSError(runtime, "RNModule.greet expects one string");
    }
    const auto name = args[0].asString(runtime).utf8(runtime);
    return jsi::String::createFromUtf8(
        runtime, "Hello from C++, " + name + "!");
  }
};
} // namespace

std::shared_ptr<TurboModule> create_rn_module(
    const std::string& name,
    std::shared_ptr<CallInvoker> jsInvoker) {
  if (name != "RNModule")
    return nullptr;
  return std::make_shared<RNModule>(std::move(jsInvoker));
}
