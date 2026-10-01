// TODO 2.6 — the LogBox surface (design doc §18.7, §19 2.6).
#pragma once

#include <react/renderer/scheduler/SurfaceDelegate.h>

#include <string>

namespace rngpui {

class GpuiHost;

/// React renders LogBox (errors = the red box, warnings = the yellow box) into
/// a *second* React surface, started with the app key `"LogBox"`
/// (`AppRegistry.registerComponent('LogBox', …)` in
/// `Libraries/ReactNative/AppRegistry.js`). Android presents that surface in a
/// dialog; we present it as an overlay inside the main GPUI window:
/// `GpuiHost::start_log_box_surface` starts surface 2, whose root view the Rust
/// store paints on top of the app surface (`store.rs`, `OverlayHost`). `hide()`
/// stops the surface again so nothing covers the app while LogBox is closed.
///
/// `LogBoxModule` (the TurboModule the JS side requires) owns this delegate:
/// its constructor calls `createContentView("LogBox")`, its destructor
/// `destroyContentView()`, and `show()`/`hide()` are driven by
/// `LogBoxData`/`NativeLogBox`.
class GpuiLogBoxSurfaceDelegate : public facebook::react::SurfaceDelegate {
 public:
  explicit GpuiLogBoxSurfaceDelegate(GpuiHost& host) : host_(host) {}

  void createContentView(std::string appKey) override;
  bool isContentViewReady() override;
  void destroyContentView() override;
  void show() override;
  void hide() override;
  bool isShowing() override;

 private:
  GpuiHost& host_;
  std::string appKey_;
  bool ready_{false};
  bool showing_{false};
};

} // namespace rngpui
