// TODO 1.5 — design doc §18.7.
//
// Signature note: this header is what the cxx bridge `include!("GpuiHost.h")`
// names in §18.6, so these are the exact types Rust sees. cxx takes the address
// of each member function and compares the *exact* signature, so the `&str`
// parameters must be `rust::Str` (a `const std::string&` fails with
// "type mismatch at 1st parameter"); the bodies convert to std::string.
#pragma once

#include "rust/cxx.h"

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
  GpuiHost(rust::Str appId, rust::Str devHost, uint32_t devPort);
  ~GpuiHost();

  bool load_script(rust::Str bundlePath, rust::Str sourceUrl);
  void start_surface(int32_t surfaceId, rust::Str moduleName, float w, float h, float scale);
  void set_surface_size(int32_t surfaceId, float w, float h, float scale);
  void stop_surface(int32_t surfaceId);
  void on_render() const;
  void dispatch_event(int32_t tag, rust::Str type, rust::Str payloadJson) const;
  void reload();

 private:
  std::shared_ptr<GpuiMountingManager> mountingManager_;
  std::shared_ptr<facebook::react::RunLoopObserverManager> runLoopObserverManager_;
  std::unique_ptr<facebook::react::ReactHost> reactHost_;
};

std::unique_ptr<GpuiHost> new_gpui_host(rust::Str appId, rust::Str devHost, uint32_t devPort);

} // namespace rngpui
