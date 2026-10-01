// TODO 1.5 — design doc §18.8.
#pragma once

#include <folly/dynamic.h>
#include <react/renderer/uimanager/IMountingManager.h>

#include <functional>
#include <mutex>
#include <unordered_map>

namespace rngpui {

using namespace facebook::react;

class GpuiMountingManager : public IMountingManager {
 public:
  explicit GpuiMountingManager(std::function<void(SurfaceId)>&& onAfterMount)
      : onAfterMount_(std::move(onAfterMount)) {}

  void executeMount(SurfaceId surfaceId, MountingTransaction&& tx) override;
  void dispatchCommand(const ShadowView& view, const std::string& name, const folly::dynamic& args) override;
  ComponentRegistryFactory getComponentRegistryFactory() override;

  // TODO 2.6 — ReactHost calls this with a real executor once a fresh instance
  // is up (`ReactHost.cpp`, createReactInstance) and with `nullptr` when it
  // tears the instance down (destroyReactInstance, i.e. every reload). The
  // teardown call is the only surface-lifecycle signal the C++ platform gets:
  // stopping a surface emits no Delete mutations (`SurfaceManager::stopSurface`
  // → `Scheduler::unregisterSurface`), so it is where the Rust store is told to
  // drop the whole tree before the reloaded instance mounts over it.
  void setSchedulerTaskExecutor(SchedulerTaskExecutor&& executor) noexcept override;

  // Called from the GPUI main thread via GpuiHost::dispatch_event.
  void dispatchEvent(Tag tag, const std::string& type, folly::dynamic&& payload);

 private:
  std::function<void(SurfaceId)> onAfterMount_;
  std::mutex emittersMutex_;
  std::unordered_map<Tag, SharedEventEmitter> emitters_; // written on JS thread, read on main
};

} // namespace rngpui
