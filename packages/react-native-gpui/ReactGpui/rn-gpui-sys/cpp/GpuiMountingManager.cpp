// TODO 1.5 — design doc §18.8.
//
// executeMount() deliberately stops at building the MountBatch and logging it:
// the Rust side has no mount handler until TODO 1.6 (the cxx bridge), so the
// batch would go nowhere. TODO 1.6 replaces the logging block with
// `rn_gpui_on_mount(std::move(batch))` — which queues it for the GPUI main
// thread and returns immediately, keeping Fabric's mounting thread free.
#include "GpuiMountingManager.h"

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (TODO 1.6, design doc §18.6)
#include "MountBatchBuilder.h"

#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/components/image/ImageComponentDescriptor.h>
#include <react/renderer/components/modal/ModalHostViewComponentDescriptor.h>
#include <react/renderer/components/scrollview/ScrollViewComponentDescriptor.h>
#include <react/renderer/components/text/ParagraphComponentDescriptor.h>
#include <react/renderer/components/text/RawTextComponentDescriptor.h>
#include <react/renderer/components/text/TextComponentDescriptor.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>

#include <string>

namespace rngpui {

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
      } else if (mutation.type == ShadowViewMutation::Delete) {
        emitters_.erase(mutation.oldChildShadowView.tag);
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
