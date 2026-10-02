// React host bridge declarations (design doc §18.7).
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
#include <functional>
#include <mutex>
#include <string>

namespace facebook::react {
class ReactHost;
class RunLoopObserverManager;
class NativeAnimatedNodesManagerProvider;
} // namespace facebook::react

namespace rngpui {

class GpuiMountingManager;
class GpuiLogBoxSurfaceDelegate;

/// Surface ids (TODO 2.6). The window shows surface 1; React starts LogBox as a
/// second surface with the app key "LogBox".
constexpr int32_t kAppSurfaceId = 1;
constexpr int32_t kLogBoxSurfaceId = 2;
/// Passed to `rn_gpui_on_surface_stopped` when every surface is gone (a reload).
constexpr int32_t kAllSurfacesStopped = -1;

class GpuiHost {
 public:
  GpuiHost(rust::Str appId, rust::Str devHost, uint32_t devPort);
  ~GpuiHost();

  bool load_script(rust::Str bundlePath, rust::Str sourceUrl);
  void start_surface(int32_t surfaceId, rust::Str moduleName, float w, float h, float scale);
  void set_surface_size(int32_t surfaceId, float w, float h, float scale);
  void set_window_metrics(float w, float h, float scale);
  void set_system_appearance(rust::Str appearance);
  void stop_surface(int32_t surfaceId);
  void on_render() const;
  void dispatch_event(int32_t tag, rust::Str type, rust::Str payloadJson) const;
  void set_scroll_offset(int32_t tag, float x, float y) const;

  // TODO 2.6 — driven by `GpuiLogBoxSurfaceDelegate`. There is no reload entry
  // point here on purpose: both reload triggers (Metro's websocket `reload`
  // message and `DevSettings.reload()`) funnel into `ReactHost`'s private
  // `reloadReactInstance()`, and `ReactHost` owns them.
  void start_log_box_surface();
  void stop_log_box_surface();

 private:
  std::shared_ptr<GpuiMountingManager> mountingManager_;
  std::shared_ptr<facebook::react::RunLoopObserverManager> runLoopObserverManager_;
  /// Passed to ReactHost as its `logBoxSurfaceDelegate` (TODO 2.6). Created
  /// before the host because ReactHost takes it in its constructor.
  std::shared_ptr<GpuiLogBoxSurfaceDelegate> logBoxDelegate_;
  /// Passed to ReactHost as its `animatedNodesManagerProvider` (TODO 2.6). It is
  /// what makes `AnimatedModule` load; without it LogBox's inspector throws
  /// "Native animated module is not available" and no red box renders.
  std::shared_ptr<facebook::react::NativeAnimatedNodesManagerProvider>
      animatedNodesManagerProvider_;
  mutable std::mutex animatedFrameMutex_;
  mutable std::function<void()> animatedFrameCallback_;
  std::unique_ptr<facebook::react::ReactHost> reactHost_;
  /// The app surface's constraints, reused for the LogBox overlay surface.
  float surfaceWidth_{0.};
  float surfaceHeight_{0.};
  float surfaceScale_{1.};
  bool scriptLoaded_{false};
};

std::unique_ptr<GpuiHost> new_gpui_host(rust::Str appId, rust::Str devHost, uint32_t devPort);
void rn_gpui_alert_result(int32_t id, int32_t buttonIndex);
void rn_gpui_clipboard_result(int32_t id, rust::String text);

} // namespace rngpui
