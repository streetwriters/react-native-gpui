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
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace facebook::react {
class ReactHost;
class RunLoopObserverManager;
class NativeAnimatedNodesManagerProvider;
class UIManager;
struct RawEvent;
using EventListener = std::function<bool(const RawEvent&)>;
} // namespace facebook::react

namespace folly {
class dynamic;
} // namespace folly

namespace rngpui {

class GpuiMountingManager;
class GpuiLogBoxSurfaceDelegate;

struct GpuiRawPointerEvent {
  std::vector<int32_t> targetChain;
  float x;
  float y;
  int32_t phase;
  double timestamp;
};

struct GpuiRecognizedGestureEvent {
  int32_t targetTag;
  std::string eventType;
  std::string payloadJson;
};

using GpuiGesturePointerProcessor =
    std::function<std::vector<GpuiRecognizedGestureEvent>(
        const GpuiRawPointerEvent&)>;

/// Surface ids (TODO 2.6). The window shows surface 1; React starts LogBox as a
/// second surface with the app key "LogBox".
constexpr int32_t kAppSurfaceId = 1;
constexpr int32_t kLogBoxSurfaceId = 2;
/// Passed to `rn_gpui_on_surface_stopped` when every surface is gone (a
/// reload).
constexpr int32_t kAllSurfacesStopped = -1;

class GpuiHost {
 public:
  GpuiHost(
      rust::Str appId,
      rust::Str devHost,
      uint32_t devPort,
      rust::Str jsEngine);
  ~GpuiHost();

  bool load_script(rust::Str bundlePath, rust::Str sourceUrl);
  void start_surface(
      int32_t surfaceId,
      rust::Str moduleName,
      float w,
      float h,
      float scale);
  /// Same, with the `initialProps` object the root component receives. The
  /// desktop window registry passes `windowId` (and the app's own props) this
  /// way, so a secondary window's component can identify itself.
  void start_surface_with_props(
      int32_t surfaceId,
      rust::Str moduleName,
      rust::Str propsJson,
      float w,
      float h,
      float scale);
  void set_surface_size(int32_t surfaceId, float w, float h, float scale);
  void set_window_metrics(float w, float h, float scale);
  void set_window_top_inset(float top);
  void set_system_appearance(rust::Str appearance);
  void stop_surface(int32_t surfaceId);
  /// Open React Native DevTools through the Metro inspector proxy.
  void open_debugger() const;
  void on_render() const;
  void on_frame(double eventTimestampMs) const;
  void on_gesture_frame(double eventTimestampMs) const;
  void dispatch_event(int32_t tag, rust::Str type, rust::Str payloadJson) const;
  void emit_device_event(rust::Str event_name) const;
  void emit_device_event_bool(rust::Str event_name, bool value) const;
  /// Device event whose payload is a JSON object (design §3.2 step 4).
  void emit_device_event_json(rust::Str event_name, rust::Str payload_json)
      const;
  void emit_accessibility_setting_event(
      const std::string& event_name,
      bool enabled) const;
  void dispatch_pointer_event(
      rust::Str targetChainJson,
      float x,
      float y,
      int32_t phase,
      double timestamp) const;
  void set_scroll_offset(int32_t tag, float x, float y) const;
  std::shared_ptr<facebook::react::UIManager> ui_manager() const;
  void synchronously_update_props(int32_t tag, const folly::dynamic& props)
      const;
  void add_event_listener(
      std::shared_ptr<const facebook::react::EventListener> listener);

  // Both developer and test reloads are owned by ReactHost.
  void request_reload();
  bool reload_in_progress() const;
  void start_log_box_surface();
  void stop_log_box_surface();

 private:
  std::shared_ptr<GpuiMountingManager> mountingManager_;
  std::shared_ptr<facebook::react::RunLoopObserverManager>
      runLoopObserverManager_;
  /// Passed to ReactHost as its `logBoxSurfaceDelegate` (TODO 2.6). Created
  /// before the host because ReactHost takes it in its constructor.
  std::shared_ptr<GpuiLogBoxSurfaceDelegate> logBoxDelegate_;
  /// Passed to ReactHost as its `animatedNodesManagerProvider` (TODO 2.6). It
  /// is what makes `AnimatedModule` load; without it LogBox's inspector throws
  /// "Native animated module is not available" and no red box renders.
  std::shared_ptr<facebook::react::NativeAnimatedNodesManagerProvider>
      animatedNodesManagerProvider_;
  mutable std::recursive_mutex animatedFrameMutex_;
  mutable std::function<void()> animatedFrameCallback_;
  std::unique_ptr<facebook::react::ReactHost> reactHost_;
  std::vector<std::shared_ptr<const facebook::react::EventListener>>
      eventListeners_;
  /// The app surface's constraints, reused for the LogBox overlay surface.
  float surfaceWidth_{0.};
  float surfaceHeight_{0.};
  float surfaceScale_{1.};
  bool scriptLoaded_{false};
};

std::unique_ptr<GpuiHost> new_gpui_host(
    rust::Str appId,
    rust::Str devHost,
    uint32_t devPort,
    rust::Str jsEngine);
std::shared_ptr<facebook::react::UIManager> get_gpui_ui_manager();
void gpui_synchronously_update_props(int32_t tag, const folly::dynamic& props);
void register_gpui_event_listener(
    std::shared_ptr<const facebook::react::EventListener> listener);
void register_gpui_gesture_pointer_processor(
    GpuiGesturePointerProcessor processor);
void rn_gpui_alert_result(int32_t id, int32_t buttonIndex);
void rn_gpui_clipboard_result(int32_t id, rust::String text);
/// Settle one `GpuiDesktop.call` promise (design §3.2 step 3).
void rn_gpui_desktop_result(int32_t id, bool ok, rust::String json);
/// Reject every in-flight `GpuiDesktop.call` (a reload tore the JS instance
/// down). Defined in `GpuiDesktopModule.cpp`.
void reject_pending_desktop_calls();

} // namespace rngpui
