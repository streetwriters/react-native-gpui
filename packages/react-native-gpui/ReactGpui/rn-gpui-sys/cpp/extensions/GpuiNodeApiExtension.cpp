// Node-API glue (@react-native-node-api). Compiled into rn_gpui_extensions
// only when weak-node-api is built. Provides the CxxNodeApiHostModule
// TurboModule and injects the weak Node-API framework on first use.
#include "CxxNodeApiHostModule.hpp"
#include "GpuiExtensions.h"
#include "WeakNodeApiInjector.hpp"

#include <mutex>

namespace rngpui {

using namespace facebook::react;

void rn_gpui_install_node_api_extension() {
  gpuiExtensionHooks().turboModules.push_back(
      [](const std::string& name, const std::shared_ptr<CallInvoker>& jsInvoker)
          -> std::shared_ptr<TurboModule> {
        if (name ==
            callstack::react_native_node_api::CxxNodeApiHostModule::
                kModuleName) {
          static std::once_flag injected;
          std::call_once(injected, [] {
            callstack::react_native_node_api::injectIntoWeakNodeApi();
          });
          return callstack::react_native_node_api::createNodeApiHostModule(
              jsInvoker);
        }
        return nullptr;
      });
}

} // namespace rngpui
