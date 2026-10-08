// The Hermes GPUI JS engine package (plan item 7.14).
//
// Core knows nothing about Hermes: it calls this registration symbol once at
// startup (generated from the `jsEngine.register` entry in
// react-native.config.js) and then asks the registry for the runtime factory.
#include "GpuiJsEngine.h"

#include <react/runtime/hermes/HermesInstance.h>

#include <memory>

// The pinned facebook/hermes commit, passed by gpui/CMakeLists.txt from this
// package's package.json.
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
  rngpui::registerJsEngine(rngpui::GpuiJsEngine{
      .info = {.name = "hermes", .version = RN_GPUI_HERMES_VERSION},
      .makeRuntimeFactory =
          [] { return std::make_shared<HermesRuntimeFactory>(); },
  });
}
