// TODO 1.5 — design doc §18.8.
//
// executeMount() deliberately stops at building the MountBatch and logging it:
// the Rust side has no mount handler until TODO 1.6 (the cxx bridge), so the
// batch would go nowhere. TODO 1.6 replaces the logging block with
// `rn_gpui_on_mount(std::move(batch))` — which queues it for the GPUI main
// thread and returns immediately, keeping Fabric's mounting thread free.
#include "GpuiMountingManager.h"

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (TODO 1.6, design doc §18.6)
#include "GpuiHost.h"               // TODO 2.6 — kAllSurfacesStopped
#include "MountBatchBuilder.h"

#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/components/image/ImageComponentDescriptor.h>
#include <react/renderer/components/modal/ModalHostViewComponentDescriptor.h>
#include <react/renderer/components/scrollview/ScrollViewComponentDescriptor.h>
#include <react/renderer/components/scrollview/ScrollViewShadowNode.h>
#include <react/renderer/components/text/ParagraphComponentDescriptor.h>
#include <react/renderer/components/text/RawTextComponentDescriptor.h>
#include <react/renderer/components/text/TextComponentDescriptor.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>

#include <string>

namespace rngpui {

void GpuiImageLoader::loadImage(
    const std::string& uri,
    const IImageLoaderOnLoadCallback&& onLoad) {
  const auto requestId = nextRequestId_.fetch_add(1);
  {
    std::lock_guard<std::mutex> lock(mutex_);
    callbacks_.emplace(requestId, std::move(onLoad));
  }
  rn_gpui_load_image(uri, requestId);
}

IImageLoader::CacheStatus GpuiImageLoader::getCacheStatus(const std::string& uri) {
  return rn_gpui_image_is_cached(uri) ? CacheStatus::Memory : CacheStatus::None;
}

void GpuiImageLoader::completeRequest(
    std::uint64_t requestId,
    double width,
    double height,
    const std::string& error) {
  IImageLoaderOnLoadCallback callback;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    auto found = callbacks_.find(requestId);
    if (found == callbacks_.end()) return;
    callback = std::move(found->second);
    callbacks_.erase(found);
  }
  callback(width, height, error.empty() ? nullptr : error.c_str());
}

void rn_gpui_on_image_load_result(
    std::uint64_t requestId,
    double width,
    double height,
    rust::String error) {
  GpuiImageLoader::completeRequest(
      requestId, width, height, std::string(error.data(), error.size()));
}

namespace {

const char* kindName(MountKind kind) {
  switch (kind) {
    case MountKind::Create:
      return "Create";
    case MountKind::Delete:
      return "Delete";
    case MountKind::Insert:
      return "Insert";
    case MountKind::Remove:
      return "Remove";
    case MountKind::Update:
      return "Update";
  }
  return "?";
}

std::string describeOp(const MountOp& op) {
  std::string out = std::string("  ") + kindName(op.kind) + " tag=" + std::to_string(op.tag) +
      " parent=" + std::to_string(op.parent_tag) + " index=" + std::to_string(op.index) + " " +
      std::string(op.component);
  if (!op.frame.w && !op.frame.h && !op.frame.x && !op.frame.y) {
    return out;
  }
  out += " frame=(" + std::to_string(op.frame.x) + "," + std::to_string(op.frame.y) + " " +
      std::to_string(op.frame.w) + "x" + std::to_string(op.frame.h) + ")";
  if (op.has_paragraph) {
    out += " fragments=" + std::to_string(op.paragraph.fragments.size());
  }
  if (!op.image_uri.empty()) {
    out += " uri=" + std::string(op.image_uri);
  }
  if (op.component == "ScrollView") {
    out += " offset=(" + std::to_string(op.scroll_x) + "," + std::to_string(op.scroll_y) + ") content=" +
        std::to_string(op.content_width) + "x" + std::to_string(op.content_height);
  }
  return out;
}

} // namespace

void GpuiMountingManager::executeMount(SurfaceId surfaceId, MountingTransaction&& transaction) {
  MountBatch batch;
  batch.surface_id = surfaceId;
  {
    std::lock_guard<std::mutex> lock(emittersMutex_);
    for (const auto& mutation : transaction.getMutations()) {
      batch.ops.push_back(buildMountOp(mutation));
      // Keep event emitters so the main thread can send events by tag.
      if (mutation.type == ShadowViewMutation::Create || mutation.type == ShadowViewMutation::Update) {
        emitters_[mutation.newChildShadowView.tag] = mutation.newChildShadowView.eventEmitter;
        const auto componentName = std::string(mutation.newChildShadowView.componentName);
        if (componentName == "ScrollView") {
          auto state = std::dynamic_pointer_cast<const ConcreteState<ScrollViewState>>(
              mutation.newChildShadowView.state);
          if (state) scrollStates_[mutation.newChildShadowView.tag] = std::move(state);
        }
      } else if (mutation.type == ShadowViewMutation::Delete) {
        emitters_.erase(mutation.oldChildShadowView.tag);
        scrollStates_.erase(mutation.oldChildShadowView.tag);
      }
    }
  }

  // Hand the batch to Rust. `rn_gpui_on_mount` only queues it (the `rn-gpui`
  // crate owns the queue); GPUI rendering happens later on the main thread.
  rn_gpui_log(
      0,
      "executeMount surface=" + std::to_string(surfaceId) + " ops=" + std::to_string(batch.ops.size()));
  for (const auto& op : batch.ops) {
    rn_gpui_log(0, describeOp(op));
  }

  rn_gpui_on_mount(std::move(batch));

  if (onAfterMount_) {
    onAfterMount_(surfaceId);
  }
}

void GpuiMountingManager::setScrollOffset(Tag tag, float x, float y) {
  std::shared_ptr<const ConcreteState<ScrollViewState>> state;
  {
    std::lock_guard<std::mutex> lock(emittersMutex_);
    auto it = scrollStates_.find(tag);
    if (it == scrollStates_.end()) return;
    state = it->second;
  }
  const auto& data = state->getData();
  state->updateState(ScrollViewState({x, y}, data.contentBoundingRect, data.scrollAwayPaddingTop));
}

void GpuiMountingManager::dispatchEvent(Tag tag, const std::string& type, folly::dynamic&& payload) {
  SharedEventEmitter emitter;
  {
    std::lock_guard<std::mutex> lock(emittersMutex_);
    auto it = emitters_.find(tag);
    if (it == emitters_.end()) {
      return;
    }
    emitter = it->second;
  }
  if (!emitter) {
    return;
  }
  // Pointer events use RawEvent::Category::Continuous for move, Discrete for
  // down/up; the default category is fine until TODO 3.x arrives.
  emitter->dispatchEvent(type, std::move(payload));
}

void GpuiMountingManager::dispatchCommand(const ShadowView&, const std::string& name, const folly::dynamic& args) {
  // TODO 3.x: forward ScrollView scrollTo, TextInput focus/blur to Rust.
  (void)name;
  (void)args;
}

void GpuiMountingManager::setSchedulerTaskExecutor(SchedulerTaskExecutor&& executor) noexcept {
  // TODO 2.6 — ReactHost calls this with a real executor when an instance is up
  // (`ReactHost.cpp` createReactInstance) and with `nullptr` when it tears the
  // instance down (destroyReactInstance, which every reload runs through
  // `reloadReactInstance`). Teardown is the only signal the C++ platform gets:
  // `SurfaceManager::stopSurface` → `Scheduler::unregisterSurface` emits no
  // Delete mutations, so the Rust store is told to drop the whole tree itself.
  if (!executor) {
    rn_gpui_on_surface_stopped(kAllSurfacesStopped);
  }
}

ComponentRegistryFactory GpuiMountingManager::getComponentRegistryFactory() {
  return [](const EventDispatcher::Weak& eventDispatcher,
            const std::shared_ptr<const ContextContainer>& contextContainer) {
    static auto registry = [] {
      auto result = std::make_shared<ComponentDescriptorProviderRegistry>();
      result->add(concreteComponentDescriptorProvider<ViewComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<ParagraphComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<TextComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<RawTextComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<ImageComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<ScrollViewComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<ModalHostViewComponentDescriptor>());
      return result;
    }();
    return registry->createComponentDescriptorRegistry({eventDispatcher, contextContainer, nullptr});
  };
}

} // namespace rngpui
