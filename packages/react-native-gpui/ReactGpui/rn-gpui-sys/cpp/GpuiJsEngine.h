// The JS engine contract (plan item 7.14).
//
// Core has no built-in JS engine. An engine is an ordinary installed package
// that registers itself here, exactly like any other native library; the core
// runtime only ever talks to the engine-neutral interfaces React Native already
// defines (JSI, JSRuntimeFactory, JSRuntime). Hermes is the first such package,
// @react-native-gpui/hermes; a QuickJS, JavaScriptCore or V8 package registers
// the same way without touching core.
//
// Registration happens once, before the host starts. `activeJsEngine()` is then
// the single place core asks for the engine's runtime factory and optional
// capabilities.
#pragma once

#include <react/featureflags/ReactNativeFeatureFlagsOverridesOSSStable.h>

#include <jsi/jsi.h>

#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace facebook::react {
class CallInvoker;
class JSRuntimeFactory;
class TurboModule;
} // namespace facebook::react

namespace rngpui {

// Core's own feature-flag overrides, exposed so an engine package can derive
// from this class and add or replace individual flags without losing core's.
class GpuiFeatureFlagsOverrides
    : public facebook::react::ReactNativeFeatureFlagsOverridesOSSStable {
 public:
  // React Native's C++ AnimatedModule queues operations until
  // finishOperationBatch(). GPUI is neither Android nor iOS, so RN's JS helper
  // only sends those batch boundaries when this flag is enabled.
  bool cxxNativeAnimatedEnabled() override {
    return true;
  }
};

struct GpuiJsEngineInfo {
  // Lowercase engine name, e.g. "hermes". Reported to JS as
  // `Platform.constants.jsEngine.name`.
  std::string name;
  // Engine version reported to JS. Free-form: an engine may report a release
  // number or the revision it was built from.
  std::string version;
};

// Every capability an engine may provide. Only `info` and `makeRuntimeFactory`
// are required; core checks the optional members before use.
struct GpuiJsEngine {
  GpuiJsEngineInfo info;

  // Required. Creates the factory ReactHost uses for every (re)load.
  std::function<std::shared_ptr<facebook::react::JSRuntimeFactory>()>
      makeRuntimeFactory;

  // Optional. Node-API for `.node` addons. Creating a napi_env for a runtime
  // and loading a module into it are VM-specific, so the engine provides the
  // "NodeApiHost" TurboModule that JS calls `requireNodeAddon` on. When
  // missing, core registers a module whose `requireNodeAddon` throws
  // Error("Node-API is not supported by the <name> JS engine").
  struct NodeApi {
    std::function<std::shared_ptr<facebook::react::TurboModule>(
        std::shared_ptr<facebook::react::CallInvoker>)>
        makeModule;
  };
  std::optional<NodeApi> nodeApi;

  // Optional. Returns the feature-flag overrides core installs. An engine that
  // needs flags of its own derives from GpuiFeatureFlagsOverrides and
  // overrides only those flags, so core's survive. When unset, core installs
  // GpuiFeatureFlagsOverrides itself.
  std::function<std::unique_ptr<
      facebook::react::ReactNativeFeatureFlagsOverridesOSSStable>()>
      makeFeatureFlagsOverrides;
};

// Called by engine packages from their registration function. Throws
// std::invalid_argument for an empty name, a duplicate name, or a missing
// runtime factory.
void registerJsEngine(GpuiJsEngine engine);

// Used by core. Throws std::runtime_error when no engine is registered, when
// several are registered and none was selected, or when the selected name is
// not registered.
const GpuiJsEngine& activeJsEngine();

// Registration order.
std::vector<GpuiJsEngineInfo> registeredJsEngines();

// Chooses the engine for this run, before the host starts. An empty name
// returns to the default: the only registered engine, or an error when several
// are registered.
void selectJsEngine(std::string_view name);

} // namespace rngpui
