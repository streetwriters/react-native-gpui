// TODO 1.5 — design doc §18.7.
//
// Signature note: the design doc passes rust::Str because the final consumer
// is the cxx bridge. Until TODO 1.6 generates that bridge, these entry points
// take std::string — the cxx bridge accepts &std::string transparently, so the
// body does not change. Only the parameter types below need to become rust::Str
// if cxx requires the exact shim type.
#pragma once

#include <cstdint>
#include <memory>
#include <string>

namespace facebook::react {
class ReactHost;
class RunLoopObserverManager;
} // namespace facebook::react

namespace rngpui {

class GpuiMountingManager;

class GpuiHost {
 public:
  GpuiHost(const std::string& appId, const std::string& devHost, uint32_t devPort);
  ~GpuiHost();

  bool load_script(const std::string& bundlePath, const std::string& sourceUrl);
  void start_surface(int32_t surfaceId, const std::string& moduleName, float w, float h, float scale);
  void set_surface_size(int32_t surfaceId, float w, float h, float scale);
  void stop_surface(int32_t surfaceId);
  void on_render() const;
  void dispatch_event(int32_t tag, const std::string& type, const std::string& payloadJson) const;
  void reload();

 private:
  std::shared_ptr<GpuiMountingManager> mountingManager_;
  std::shared_ptr<facebook::react::RunLoopObserverManager> runLoopObserverManager_;
  std::unique_ptr<facebook::react::ReactHost> reactHost_;
};

std::unique_ptr<GpuiHost> new_gpui_host(const std::string& appId, const std::string& devHost, uint32_t devPort);

} // namespace rngpui
