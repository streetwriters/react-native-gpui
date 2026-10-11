#include "GpuiJsEngine.h"
#include "HermesNodeAddons.h"

#include <react/runtime/hermes/HermesInstance.h>

#include <memory>
#include <optional>
#include <utility>

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
  // The Node-API host and loader are not compiled on Windows yet (see the
  // WIN32 guard in gpui/CMakeLists.txt): this engine's
  // `hermes_napi_load_module` raises "Loading native modules is not supported
  // on Windows" at the pinned commit, so the capability is honestly absent
  // rather than present and broken. `_requireNodeLibrary` then reports the
  // engine as one that cannot load addons. Both the guard and this branch go
  // away with the Windows loader (Part N).
  std::optional<rngpui::GpuiJsEngine::NodeAddons> nodeAddons;
#if !defined(_WIN32)
  nodeAddons = rngpui::GpuiJsEngine::NodeAddons{
      .makeLoader = rngpui::makeHermesNodeAddonLoader};
#endif

  rngpui::GpuiJsEngine engine{
      .info = {.name = "hermes", .version = RN_GPUI_HERMES_VERSION},
      .makeRuntimeFactory =
          [] { return std::make_shared<HermesRuntimeFactory>(); },
      // Hermes implements Node-API itself and ships the host-integration
      // interface (API/napi/hermes_napi.h) this package compiles against, so
      // `.node` loading is this engine's capability. Core owns everything else:
      // resolving the file, the cache and the error messages.
      .nodeAddons = std::move(nodeAddons),
  };
  rngpui::registerJsEngine(std::move(engine));
}
