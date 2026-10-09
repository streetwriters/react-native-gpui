#include "GpuiJsEngine.h"

#include <react/runtime/hermes/HermesInstance.h>

#include <memory>
#include <utility>

// Set by core's rn_gpui_extensions when @react-native-node-api is present, in
// which case this package also compiles the Node-API host module
// (RN_GPUI_JS_ENGINE_NODE_API_SOURCES in gpui/CMakeLists.txt).
#ifdef RN_GPUI_HAS_NODE_API
#include "CxxNodeApiHostModule.hpp"
#endif

#ifndef RN_GPUI_HERMES_VERSION
#define RN_GPUI_HERMES_VERSION ""
#endif

namespace {
class HermesRuntimeFactory final : public facebook::react::JSRuntimeFactory {
 public:
  std::unique_ptr<facebook::react::JSRuntime> createJSRuntime(
      std::shared_ptr<facebook::react::MessageQueueThread>
          msgQueueThread) noexcept override {
    return facebook::react::HermesInstance::createJSRuntime(
        nullptr, std::move(msgQueueThread), /* allocInOldGenBeforeTTI */ false);
  }
};

} // namespace

extern "C" void rn_gpui_register_js_engine_hermes() {
  rngpui::GpuiJsEngine engine{
      .info = {.name = "hermes", .version = RN_GPUI_HERMES_VERSION},
      .makeRuntimeFactory =
          [] { return std::make_shared<HermesRuntimeFactory>(); },
#ifdef RN_GPUI_HAS_NODE_API
      // Hermes is the VM the host integration in react-native-node-api talks
      // to (HermesNapiHost), so the module it ships is this engine's Node-API
      // capability. The weak-node-api injection stays in core.
      .nodeApi =
          rngpui::GpuiJsEngine::NodeApi{
              .makeModule =
                  [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
                    return callstack::react_native_node_api::
                        createNodeApiHostModule(std::move(jsInvoker));
                  }},
#endif
  };
  rngpui::registerJsEngine(std::move(engine));
}
