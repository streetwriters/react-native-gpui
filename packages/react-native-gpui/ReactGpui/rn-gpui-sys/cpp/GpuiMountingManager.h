// Fabric mounting manager (design doc §18.8).
#pragma once

#include <folly/dynamic.h>
#include <react/io/IImageLoader.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/components/modal/ModalHostViewState.h>
#include <react/renderer/components/scrollview/ScrollViewState.h>
#include <react/renderer/core/ConcreteState.h>
#include <react/renderer/uimanager/IMountingManager.h>
#include "GpuiImageLoader.h"

#include <atomic>
#include <functional>
#include <mutex>
#include <unordered_map>

namespace rngpui {

void rn_gpui_register_app_components(
    facebook::react::ComponentDescriptorProviderRegistry& registry);

using namespace facebook::react;

class GpuiImageLoader final : public IImageLoader {
 public:
  void loadImage(
      const std::string& uri,
      const IImageLoaderOnLoadCallback&& onLoad) override;
  CacheStatus getCacheStatus(const std::string& uri) override;
  static void
  completeRequest(std::uint64_t, double, double, const std::string&);

 private:
  inline static std::atomic<std::uint64_t> nextRequestId_{1};
  inline static std::mutex mutex_;
  inline static std::unordered_map<std::uint64_t, IImageLoaderOnLoadCallback>
      callbacks_;
};

class GpuiMountingManager : public IMountingManager {
 public:
  explicit GpuiMountingManager(std::function<void(SurfaceId)>&& onAfterMount)
      : onAfterMount_(std::move(onAfterMount)) {}

  void executeMount(SurfaceId surfaceId, MountingTransaction&& tx) override;
  void synchronouslyUpdateViewOnUIThread(Tag tag, const folly::dynamic& props)
      override;
  void dispatchCommand(
      const ShadowView& view,
      const std::string& name,
      const folly::dynamic& args) override;
  ComponentRegistryFactory getComponentRegistryFactory() override;
  std::shared_ptr<IImageLoader> getImageLoader() noexcept override {
    return imageLoader_;
  }

  // TODO 2.6 — ReactHost calls this with a real executor once a fresh instance
  // is up (`ReactHost.cpp`, createReactInstance) and with `nullptr` when it
  // tears the instance down (destroyReactInstance, i.e. every reload). The
  // teardown call is the only surface-lifecycle signal the C++ platform gets:
  // stopping a surface emits no Delete mutations (`SurfaceManager::stopSurface`
  // → `Scheduler::unregisterSurface`), so it is where the Rust store is told to
  // drop the whole tree before the reloaded instance mounts over it.
  void setSchedulerTaskExecutor(
      SchedulerTaskExecutor&& executor) noexcept override;

  // Called from the GPUI main thread via GpuiHost::dispatch_event.
  void
  dispatchEvent(Tag tag, const std::string& type, folly::dynamic&& payload);
  void setScrollOffset(Tag tag, float x, float y);
  void setWindowSize(float width, float height);

 private:
  std::function<void(SurfaceId)> onAfterMount_;
  std::shared_ptr<GpuiImageLoader> imageLoader_ =
      std::make_shared<GpuiImageLoader>();
  std::mutex emittersMutex_;
  std::unordered_map<Tag, ShadowView> animatedViews_;
  std::unordered_map<Tag, SharedEventEmitter>
      emitters_; // written on JS thread, read on main
  std::unordered_map<Tag, std::shared_ptr<const ConcreteState<ScrollViewState>>>
      scrollStates_;
  std::unordered_map<
      Tag,
      std::shared_ptr<const ConcreteState<ModalHostViewState>>>
      modalStates_;
};

} // namespace rngpui
