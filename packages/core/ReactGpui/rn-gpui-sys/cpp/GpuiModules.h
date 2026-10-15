// Code that depends on an optional package is a module: it lives in the
// package itself, under `gpui/cpp/`, and is compiled only when that package is
// installed. The platform's own modules live in cpp/modules/. A module sets the
// hooks it needs; an unset hook means core does what it does when the library
// is absent.
#pragma once

#include "rn-gpui-sys/src/lib.rs.h" // MountOp

#include <react/renderer/core/EventEmitter.h>
#include <react/renderer/core/Props.h>
#include <react/renderer/core/ReactPrimitives.h>
#include <react/renderer/mounting/ShadowView.h>

#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/TurboModule.h>

#include <array>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace rngpui {
// SVG (@react-native-gpui/svg): JSON for an RNSVG* component's props. Called
// from buildMountOp for components whose name starts with "RNSVG".
using GpuiSvgPropsJsonFn = std::function<std::string(
    const std::string& component,
    const facebook::react::Props& props)>;

// Screens (@react-native-gpui/screens): fills the header and screen fields of
// a MountOp. Called from buildMountOp.
using GpuiScreensOpFn = std::function<
    void(const facebook::react::ShadowView& shadowView, MountOp& op)>;

// Screens: adjusts the frame of a header or content wrapper after the op's
// frame and header fields are set.
using GpuiScreensFrameFn = std::function<void(MountOp& op)>;

// The mounting manager's per-view state, handed to the safe-area hooks. The
// references point at GpuiMountingManager members. The emittersMutex must be
// held while viewFrameChanged and viewDeleted run; the other hooks take it
// themselves.
struct GpuiMountedViews {
  std::mutex& emittersMutex;
  std::unordered_map<facebook::react::Tag, facebook::react::SharedEventEmitter>&
      emitters;
  std::unordered_map<facebook::react::Tag, facebook::react::ShadowView>&
      animatedViews;
  std::unordered_map<facebook::react::Tag, std::array<float, 4>>&
      safeAreaFrames;
};

struct GpuiSafeAreaHooks {
  // Insert, or Update with a changed frame, of a mounted view.
  std::function<void(
      facebook::react::SurfaceId surfaceId,
      const facebook::react::ShadowView& view,
      GpuiMountedViews& views)>
      viewFrameChanged;
  // Delete of a mounted view.
  std::function<void(facebook::react::Tag tag, GpuiMountedViews& views)>
      viewDeleted;
  // After a batch is queued: applies the current window top inset.
  std::function<void(GpuiMountedViews& views)> afterMount;
  std::function<void(float top, GpuiMountedViews& views)> windowTopInset;
};

// Extra TurboModules (the active JS engine's, Rust string modules). Asked in
// registration order, after the app's own provider and before the core
// modules; each returns nullptr when the module is not provided there.
using GpuiTurboModuleFn =
    std::function<std::shared_ptr<facebook::react::TurboModule>(
        const std::string& name,
        const std::shared_ptr<facebook::react::CallInvoker>& jsInvoker)>;

// Called once per frame with a steady-clock timestamp in ms
// (@react-native-gpui/worklets).
using GpuiFrameFn = std::function<void(double timestampMs)>;

struct GpuiModuleHooks {
  GpuiSvgPropsJsonFn svgPropsJson;
  GpuiScreensOpFn screensOp;
  GpuiScreensFrameFn screensFrame;
  GpuiSafeAreaHooks safeArea;
  std::vector<GpuiTurboModuleFn> turboModules;
  GpuiFrameFn frame;
};

// Hooks are set by the installers at startup, before any surface starts.
GpuiModuleHooks& gpuiModuleHooks();

void rn_gpui_install_modules();

} // namespace rngpui
