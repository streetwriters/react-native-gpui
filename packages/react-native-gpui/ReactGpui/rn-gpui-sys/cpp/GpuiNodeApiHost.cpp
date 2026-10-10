#include "GpuiJsEngine.h"
#include "GpuiModules.h"
#include "WeakNodeApiInjector.hpp"

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include <mutex>
#include <string>
#include <utility>

namespace rngpui {
namespace {
constexpr const char* kNodeApiHostModuleName = "NodeApiHost";

// Registered instead of the engine's host when the active engine has no
// Node-API support. Requiring an addon then fails with a message that names the
// engine rather than a bare "module not found".
class UnsupportedNodeApiModule final : public facebook::react::TurboModule {
 public:
  UnsupportedNodeApiModule(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker,
      std::string message)
      : TurboModule(kNodeApiHostModuleName, std::move(jsInvoker)),
        message_(std::move(message)) {
    methodMap_["requireNodeAddon"] =
        MethodMetadata{1, &UnsupportedNodeApiModule::requireNodeAddon};
  }

  static facebook::jsi::Value requireNodeAddon(
      facebook::jsi::Runtime& rt,
      facebook::react::TurboModule& turboModule,
      const facebook::jsi::Value* /*args*/,
      size_t /*count*/) {
    throw facebook::jsi::JSError(
        rt, static_cast<UnsupportedNodeApiModule&>(turboModule).message_);
  }

 private:
  std::string message_;
};

} // namespace

void rn_gpui_install_node_api_module() {
  gpuiModuleHooks().turboModules.push_back(
      [](const std::string& name,
         const std::shared_ptr<facebook::react::CallInvoker>& jsInvoker)
          -> std::shared_ptr<facebook::react::TurboModule> {
        if (name != kNodeApiHostModuleName) {
          return nullptr;
        }
        static std::once_flag injected;
        std::call_once(injected, [] {
          callstack::react_native_node_api::injectIntoWeakNodeApi();
        });

        const auto& engine = activeJsEngine();
        if (!engine.nodeApi) {
          return std::make_shared<UnsupportedNodeApiModule>(
              jsInvoker,
              "Node-API is not supported by the " + engine.info.name +
                  " JS engine");
        }
        return engine.nodeApi->makeModule(jsInvoker);
      });
}

} // namespace rngpui
