// TODO 1.5 — design doc §18.7.
#include "GpuiHost.h"

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (TODO 1.6, design doc §18.6)
#include "GpuiHttpClient.h"
#include "GpuiLogBoxSurfaceDelegate.h"
#include "GpuiMountingManager.h"

#include <folly/json.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/featureflags/ReactNativeFeatureFlagsOverridesOSSStable.h>
#include <react/http/IHttpClient.h>
#include <react/http/IWebSocketClient.h>
#include <react/renderer/animated/NativeAnimatedNodesManagerProvider.h>
#include <react/renderer/scheduler/Scheduler.h>
#include <react/runtime/ReactHost.h>
#include <react/utils/ContextContainer.h>
#include <react/utils/RunLoopObserverManager.h>

#include <cstdio>
#include <mutex>
#include <utility>

using namespace facebook::react;

namespace rngpui {

namespace {

// Installs the OSS stable feature flags, which is what an OSS app on the new
// (bridgeless) architecture does. `enableBridgelessArchitecture` is load
// bearing for us: ReactHost here IS the bridgeless host, and the flag is what
// makes the Hermes runtime turn on its microtask queue
// (ReactCommon/react/runtime/hermes/HermesInstance.cpp:73); without it, React's
// rendering path fails with "Could not enqueue microtask because they are
// disabled in this runtime".
void install_feature_flags() {
  static std::once_flag once;
  std::call_once(once, [] {
    ReactNativeFeatureFlags::override(
        std::make_unique<ReactNativeFeatureFlagsOverridesOSSStable>());
  });
}

} // namespace

std::unique_ptr<GpuiHost> new_gpui_host(rust::Str appId, rust::Str devHost, uint32_t devPort) {
  return std::make_unique<GpuiHost>(appId, devHost, devPort);
}

GpuiHost::GpuiHost(rust::Str appId, rust::Str devHost, uint32_t devPort) {
  install_feature_flags();

  ReactInstanceConfig config;
  config.appId = std::string(appId);
  config.deviceName = "rn-gpui";
  config.devServerHost = std::string(devHost);
  config.devServerPort = devPort;

  mountingManager_ = std::make_shared<GpuiMountingManager>([this](SurfaceId surfaceId) {
    reactHost_->runOnScheduler([surfaceId](Scheduler& scheduler) {
      scheduler.reportMount(surfaceId);
    });
  });

  // ReactHost's constructor throws std::runtime_error("No HttpClientFactory
  // provided") / ("No WebSocketClientFactory provided") unless both factories
  // are in the ContextContainer. The WebSocket one comes from the vendored
  // ReactCxxPlatform cxx client; the HTTP one is our placeholder until TODO 2.1
  // brings Metro in (ContextContainer::insert is const, so the container can
  // stay shared_ptr<const>).
  auto contextContainer = std::make_shared<const ContextContainer>();
  contextContainer->insert(HttpClientFactoryKey, gpui_http_client_factory());
  contextContainer->insert(WebSocketClientFactoryKey, getWebSocketClientFactory());

  runLoopObserverManager_ = std::make_shared<RunLoopObserverManager>();

  // TODO 2.6 — the LogBox inspector animates its loading indicator, and
  // `Libraries/Animated/NativeAnimatedHelper.js` throws "Native animated module
  // is not available" when `NativeAnimatedModule` cannot be loaded — which
  // aborts the whole LogBox render, so no red box. Supplying the provider is
  // what makes `ReactCxxTurboModuleProvider` build `AnimatedModule`. The frame
  // callbacks stay null: driving animation frames is the animation TODO
  // (Phase 4), so a native-driver animation keeps its initial value for now
  // instead of advancing.
  animatedNodesManagerProvider_ = std::make_shared<NativeAnimatedNodesManagerProvider>();

  // TODO 2.6 — the LogBox surface. ReactHost hands this to
  // `ReactCxxTurboModuleProvider`, which builds `LogBoxModule` only when the
  // delegate is set (`ReactCxxTurboModuleProvider.cpp`); without it the JS side
  // logs "Failed to load TurboModule: LogBox" and no red box appears.
  logBoxDelegate_ = std::make_shared<GpuiLogBoxSurfaceDelegate>(*this);

  reactHost_ = std::make_unique<ReactHost>(
      config,
      mountingManager_,
      runLoopObserverManager_,
      std::move(contextContainer),
      /* onJsError */ [](facebook::jsi::Runtime&, const JsErrorHandler::ProcessedError& error) {
        rn_gpui_log(3, error.message);
      },
      /* logger */ [](const std::string& message, unsigned int level) {
        rn_gpui_log(static_cast<int32_t>(level), message);
      },
      /* devUIDelegate */ nullptr,
      /* turboModuleProviders */ TurboModuleProviders{},
      /* logBoxSurfaceDelegate */ logBoxDelegate_,
      /* animatedNodesManagerProvider */ animatedNodesManagerProvider_);
}

GpuiHost::~GpuiHost() {
  reactHost_->stopAllSurfaces();
}

bool GpuiHost::load_script(rust::Str bundlePath, rust::Str sourceUrl) {
  return reactHost_->loadScript(std::string(bundlePath), std::string(sourceUrl));
}

void GpuiHost::start_surface(int32_t id, rust::Str module, float w, float h, float scale) {
  LayoutConstraints constraints;
  constraints.minimumSize = {w, h};
  constraints.maximumSize = {w, h};
  // SurfaceHandler asserts on Undefined; GPUI surfaces are LTR for now (an RTL
  // flag would come from the GPUI window's text direction).
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = scale;
  if (id == kAppSurfaceId) {
    // Remembered for the LogBox overlay surface (TODO 2.6).
    surfaceWidth_ = w;
    surfaceHeight_ = h;
    surfaceScale_ = scale;
  }
  reactHost_->startSurface(id, std::string(module), folly::dynamic::object(), constraints, context);
}

void GpuiHost::set_surface_size(int32_t id, float w, float h, float scale) {
  LayoutConstraints constraints;
  constraints.minimumSize = {w, h};
  constraints.maximumSize = {w, h};
  // SurfaceHandler asserts on Undefined; GPUI surfaces are LTR for now (an RTL
  // flag would come from the GPUI window's text direction).
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = scale;
  if (id == kAppSurfaceId) {
    // Remembered for the LogBox overlay surface (TODO 2.6).
    surfaceWidth_ = w;
    surfaceHeight_ = h;
    surfaceScale_ = scale;
  }
  reactHost_->setSurfaceConstraints(id, constraints, context);
}

void GpuiHost::stop_surface(int32_t id) {
  reactHost_->stopSurface(id);
  // Fabric emits no Delete mutations for a surface that is torn down, so the
  // store has to drop it explicitly (TODO 2.6).
  rn_gpui_on_surface_stopped(id);
}

/// TODO 2.6 — start the LogBox surface (see `GpuiLogBoxSurfaceDelegate`).
void GpuiHost::start_log_box_surface() {
  LayoutConstraints constraints;
  constraints.minimumSize = {surfaceWidth_, surfaceHeight_};
  constraints.maximumSize = {surfaceWidth_, surfaceHeight_};
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = surfaceScale_;
  reactHost_->startSurface(
      kLogBoxSurfaceId, "LogBox", folly::dynamic::object(), constraints, context);
}

/// TODO 2.6 — stop the LogBox surface again: `hide()` is what keeps a closed
/// LogBox from covering the app surface with an empty full-size overlay.
void GpuiHost::stop_log_box_surface() {
  reactHost_->stopSurface(kLogBoxSurfaceId);
  rn_gpui_on_surface_stopped(kLogBoxSurfaceId);
}

void GpuiHost::on_render() const {
  runLoopObserverManager_->onRender();
}

void GpuiHost::dispatch_event(int32_t tag, rust::Str type, rust::Str payloadJson) const {
  mountingManager_->dispatchEvent(tag, std::string(type), folly::parseJson(std::string(payloadJson)));
}

} // namespace rngpui
