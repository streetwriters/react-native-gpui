// TODO 1.5 — design doc §18.7.
#include "GpuiHost.h"

#include "GpuiBridge.h" // TODO 1.6: replace with "rn-gpui-sys/src/lib.rs.h"
#include "GpuiMountingManager.h"

#include <folly/json.h>
#include <react/renderer/scheduler/Scheduler.h>
#include <react/runtime/ReactHost.h>
#include <react/utils/ContextContainer.h>
#include <react/utils/RunLoopObserverManager.h>

#include <cstdio>
#include <utility>

using namespace facebook::react;

namespace rngpui {

// TODO 1.6: the cxx bridge provides rn_gpui_log (forwarding to the Rust `log`
// crate) — delete this definition then. Until the Rust side exists, logging to
// stderr is what makes the mount traffic observable.
void rn_gpui_log(int32_t level, const std::string& message) {
  static const char* const kLevels[] = {"debug", "info", "warn", "error"};
  const char* name = (level >= 0 && level < 4) ? kLevels[level] : "log";
  std::fprintf(stderr, "[rn-gpui][%s] %s\n", name, message.c_str());
}

std::unique_ptr<GpuiHost> new_gpui_host(const std::string& appId, const std::string& devHost, uint32_t devPort) {
  return std::make_unique<GpuiHost>(appId, devHost, devPort);
}

GpuiHost::GpuiHost(const std::string& appId, const std::string& devHost, uint32_t devPort) {
  ReactInstanceConfig config;
  config.appId = appId;
  config.deviceName = "rn-gpui";
  config.devServerHost = devHost;
  config.devServerPort = devPort;

  mountingManager_ = std::make_shared<GpuiMountingManager>([this](SurfaceId surfaceId) {
    reactHost_->runOnScheduler([surfaceId](Scheduler& scheduler) {
      scheduler.reportMount(surfaceId);
    });
  });

  // TODO 2.x: insert the real HttpClientFactory / WebSocketClientFactory from
  // ReactCxxPlatform/react/http here (as TesterAppDelegate does). ReactHost's
  // constructor throws std::runtime_error("No HttpClientFactory provided") /
  // ("No WebSocketClientFactory provided") without them, so a runnable host
  // needs those inserts before this point.
  auto contextContainer = std::make_shared<const ContextContainer>();

  runLoopObserverManager_ = std::make_shared<RunLoopObserverManager>();

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
      });
}

GpuiHost::~GpuiHost() {
  reactHost_->stopAllSurfaces();
}

bool GpuiHost::load_script(const std::string& bundlePath, const std::string& sourceUrl) {
  return reactHost_->loadScript(bundlePath, sourceUrl);
}

void GpuiHost::start_surface(int32_t id, const std::string& module, float w, float h, float scale) {
  LayoutConstraints constraints;
  constraints.minimumSize = {w, h};
  constraints.maximumSize = {w, h};
  LayoutContext context;
  context.pointScaleFactor = scale;
  reactHost_->startSurface(id, module, folly::dynamic::object(), constraints, context);
}

void GpuiHost::set_surface_size(int32_t id, float w, float h, float scale) {
  LayoutConstraints constraints;
  constraints.minimumSize = {w, h};
  constraints.maximumSize = {w, h};
  LayoutContext context;
  context.pointScaleFactor = scale;
  reactHost_->setSurfaceConstraints(id, constraints, context);
}

void GpuiHost::stop_surface(int32_t id) {
  reactHost_->stopSurface(id);
}

void GpuiHost::on_render() const {
  runLoopObserverManager_->onRender();
}

void GpuiHost::dispatch_event(int32_t tag, const std::string& type, const std::string& payloadJson) const {
  mountingManager_->dispatchEvent(tag, type, folly::parseJson(payloadJson));
}

void GpuiHost::reload() {
  // TODO 2.6: ReactHost::reload is private; reload must go through the
  // DevSupport path instead.
}

} // namespace rngpui
