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
#include <react/renderer/graphics/Color.h>
#include <react/renderer/mounting/ShadowView.h>

#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/TurboModule.h>

#include <array>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace rngpui {
// Screens (@react-native-gpui/screens): fills the header and screen fields of
// a MountOp. Called from buildMountOp.
using GpuiScreensOpFn = std::function<
    void(const facebook::react::ShadowView& shadowView, MountOp& op)>;

// Screens: adjusts the frame of a header or content wrapper after the op's
// frame and header fields are set.
using GpuiScreensFrameFn = std::function<void(MountOp& op)>;

// Extra TurboModules (the active JS engine's, Rust string modules). Asked in
// registration order, after the app's own provider and before the core
// modules; each returns nullptr when the module is not provided there.
using GpuiTurboModuleFn =
    std::function<std::shared_ptr<facebook::react::TurboModule>(
        const std::string& name,
        const std::shared_ptr<facebook::react::CallInvoker>& jsInvoker)>;

// Called once per frame with a steady-clock timestamp in ms.
using GpuiFrameFn = std::function<void(double timestampMs)>;

namespace extension {

using ComponentPropsFn = std::function<std::string(
    const std::string& componentName,
    const facebook::react::ShadowView& shadowView)>;

struct MountObserver {
  std::function<void(
      facebook::react::SurfaceId surfaceId,
      const facebook::react::ShadowView& view)>
      onFrameChanged;
  std::function<void(facebook::react::Tag tag)> onDeleted;
  std::function<void()> afterBatch;
};

using WindowInsetsFn =
    std::function<void(float top, float right, float bottom, float left)>;

struct RawPointerEvent {
  std::vector<int32_t> targetChain;
  float x;
  float y;
  int32_t phase;
  double timestamp;
};

struct RecognizedGesture {
  int32_t targetTag;
  std::string eventType;
  std::string payloadJson;
};

using PointerObserverFn =
    std::function<std::vector<RecognizedGesture>(const RawPointerEvent&)>;

} // namespace extension

struct GpuiModuleHooks {
  GpuiScreensOpFn screensOp;
  GpuiScreensFrameFn screensFrame;
  std::vector<GpuiTurboModuleFn> turboModules;
  GpuiFrameFn frame;
};

struct GpuiExtensionHooks {
  std::unordered_map<std::string, extension::ComponentPropsFn> componentProps;
  std::vector<extension::MountObserver> mountObservers;
  std::vector<extension::WindowInsetsFn> windowInsetsObservers;
  std::vector<GpuiFrameFn> frameCallbacks;
  std::vector<extension::PointerObserverFn> pointerObservers;
  std::unordered_map<std::string, bool> frameRequests;
};

uint32_t argb(const facebook::react::SharedColor& color);

// Hooks are set by the installers at startup, before any surface starts.
GpuiModuleHooks& gpuiModuleHooks();

void registerComponentProps(
    const std::string& componentName,
    extension::ComponentPropsFn fn);

void registerMountObserver(extension::MountObserver observer);

void registerWindowInsetsObserver(extension::WindowInsetsFn fn);

void registerFrameCallback(GpuiFrameFn fn);

void requestFrames(const std::string& owner, bool needsFrames);
bool anyFrameRequested();
void reportPendingWork(const std::string& owner, uint64_t count);
uint64_t pendingWork();

void updateFrameDemand();

void registerPointerObserver(extension::PointerObserverFn fn);

GpuiExtensionHooks& gpuiExtensionHooks();

void rn_gpui_install_modules();

} // namespace rngpui
