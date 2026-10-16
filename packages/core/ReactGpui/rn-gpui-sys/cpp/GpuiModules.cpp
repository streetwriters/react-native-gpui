#include "GpuiModules.h"

#include <mutex>

namespace rngpui {
namespace {
// `frameRequests` is the one registry written at runtime (a module asks for
// frames from the JS thread), so it needs its own lock. The others are filled
// at startup, before any surface exists.
std::mutex frameRequestsMutex;
} // namespace

GpuiModuleHooks& gpuiModuleHooks() {
  static GpuiModuleHooks hooks;
  return hooks;
}

GpuiExtensionHooks& gpuiExtensionHooks() {
  static GpuiExtensionHooks hooks;
  return hooks;
}

void registerComponentProps(
    const std::string& componentName,
    extension::ComponentPropsFn fn) {
  gpuiExtensionHooks().componentProps[componentName] = std::move(fn);
}

void registerMountObserver(extension::MountObserver observer) {
  gpuiExtensionHooks().mountObservers.push_back(std::move(observer));
}

void registerWindowInsetsObserver(extension::WindowInsetsFn fn) {
  gpuiExtensionHooks().windowInsetsObservers.push_back(std::move(fn));
}

void registerFrameCallback(GpuiFrameFn fn) {
  gpuiExtensionHooks().frameCallbacks.push_back(std::move(fn));
}

void requestFrames(const std::string& owner, bool needsFrames) {
  {
    std::lock_guard<std::mutex> lock(frameRequestsMutex);
    gpuiExtensionHooks().frameRequests[owner] = needsFrames;
  }
  updateFrameDemand();
}

bool anyFrameRequested() {
  std::lock_guard<std::mutex> lock(frameRequestsMutex);
  for (const auto& [owner, needsFrames] : gpuiExtensionHooks().frameRequests) {
    if (needsFrames)
      return true;
  }
  return false;
}

void registerPointerObserver(extension::PointerObserverFn fn) {
  gpuiExtensionHooks().pointerObservers.push_back(std::move(fn));
}

} // namespace rngpui
