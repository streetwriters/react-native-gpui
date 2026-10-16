// Code that depends on an optional package is a module: it lives in the
// package itself, under `gpui/cpp/`, and is compiled only when that package is
// installed. The platform's own modules live in cpp/modules/. A module sets the
// hooks it needs; an unset hook means core does what it does when the library
// is absent.
//
// The extension API below is what a module uses. It is generic, keyed by name,
// and names no library.
//
// registerComponentProps(name, fn): JSON props for one component name.
//   MountBatchBuilder calls it for that component and stores the result in
//   MountOp.extension_props_json.
// registerMountObserver(observer): per-view mount callbacks. The observer owns
//   its state; core hands it the view and nothing else.
// registerWindowInsetsObserver(fn): the window's insets, on change.
// registerFrameCallback(fn): called once per frame. A list, not one slot.
// requestFrames(owner, bool): asks core to keep delivering frames while that
//   owner needs them. Core stops when no owner asks.
// registerPointerObserver(fn): raw pointer events before RN dispatch.
// turboModules: extra TurboModules, asked in registration order.
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

// The generic extension API. A module registers by name or as an observer, so
// core never names the module. Everything here is additive: the older named
// hooks above stay until the module that uses them has moved.
namespace extension {

// JSON props for one component name. `componentName` is the Fabric component
// name; the ShadowView carries the props and layout.
using ComponentPropsFn = std::function<std::string(
    const std::string& componentName,
    const facebook::react::ShadowView& shadowView)>;

// What an observer sees about a mounted view. Core fills only these fields; the
// observer keeps any state of its own.
struct MountObserver {
  std::function<void(
      facebook::react::SurfaceId surfaceId,
      const facebook::react::ShadowView& view)>
      onFrameChanged;
  std::function<void(facebook::react::Tag tag)> onDeleted;
  std::function<void()> afterBatch;
};

// Window insets in DIPs.
using WindowInsetsFn =
    std::function<void(float top, float right, float bottom, float left)>;

// A raw pointer event, before React Native dispatch. `targetChain` is the hit
// chain from the target outward; `phase` follows RN's pointer phases.
struct RawPointerEvent {
  std::vector<int32_t> targetChain;
  float x;
  float y;
  int32_t phase;
  double timestamp;
};

// A gesture the observer recognised in a pointer event. Core dispatches each
// one back to its target tag.
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

// The extension registries. Modules write these; core reads them.
struct GpuiExtensionHooks {
  std::unordered_map<std::string, extension::ComponentPropsFn> componentProps;
  std::vector<extension::MountObserver> mountObservers;
  std::vector<extension::WindowInsetsFn> windowInsetsObservers;
  std::vector<GpuiFrameFn> frameCallbacks;
  std::vector<extension::PointerObserverFn> pointerObservers;
  // Owners that asked for continuous frames, by name. The set never empties;
  // the value says whether the owner needs frames right now.
  std::unordered_map<std::string, bool> frameRequests;
};

// Hooks are set by the installers at startup, before any surface starts.
GpuiModuleHooks& gpuiModuleHooks();

// Registers `fn` for `componentName`, replacing any earlier registration.
void registerComponentProps(
    const std::string& componentName,
    extension::ComponentPropsFn fn);

void registerMountObserver(extension::MountObserver observer);

void registerWindowInsetsObserver(extension::WindowInsetsFn fn);

// Appends `fn`; registration order is call order.
void registerFrameCallback(GpuiFrameFn fn);

// Whether `owner` asked for frames. Any owner asking keeps frames running.
void requestFrames(const std::string& owner, bool needsFrames);
bool anyFrameRequested();

// Re-evaluates the frame chain from every demand source: native animations,
// and any module that asked through `requestFrames`. Defined in GpuiHost.cpp.
void updateFrameDemand();

void registerPointerObserver(extension::PointerObserverFn fn);

GpuiExtensionHooks& gpuiExtensionHooks();

void rn_gpui_install_modules();

} // namespace rngpui
