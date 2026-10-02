// Fabric mounting manager implementation (design doc §18.8).
// `executeMount()` flattens mutations and queues the batch for the GPUI main
// thread, keeping Fabric's mounting thread free while GPUI applies the tree.
#include "GpuiMountingManager.h"
#include <react/runtime/GpuiDebug.h>

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (design doc §18.6)
#include "GpuiHost.h"               // TODO 2.6 — kAllSurfacesStopped
#include "MountBatchBuilder.h"
#include "react/coremodules/DeviceInfoModule.h"

#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/components/image/ImageComponentDescriptor.h>
#include <react/renderer/components/iostextinput/TextInputComponentDescriptor.h>
#include <react/renderer/components/modal/ModalHostViewShadowNode.h>
#include <react/renderer/components/modal/ModalHostViewState.h>
#include <react/renderer/components/FBReactNativeSpec/EventEmitters.h>
#include <react/renderer/components/scrollview/ScrollViewComponentDescriptor.h>
#include <react/renderer/components/scrollview/ScrollViewShadowNode.h>
#include <react/renderer/components/text/ParagraphComponentDescriptor.h>
#include <react/renderer/components/text/RawTextComponentDescriptor.h>
#include <react/renderer/components/text/TextComponentDescriptor.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>
#include <react/renderer/components/view/conversions.h>

#include <string>
#include <string_view>
#include <atomic>
#include <folly/json.h>
#include <cstdlib>
#include <glog/logging.h>

namespace rngpui {

class GpuiModalHostViewComponentDescriptor final
    : public ConcreteComponentDescriptor<ModalHostViewShadowNode> {
 public:
  using ConcreteComponentDescriptor::ConcreteComponentDescriptor;

  State::Shared createInitialState(
      const Props::Shared& /*props*/,
      const ShadowNodeFamily::Shared& family) const override {
    return std::make_shared<ModalHostViewShadowNode::ConcreteState>(
        std::make_shared<const ModalHostViewState>(DeviceInfoModule::windowSize()), family);
  }

 protected:
  void adopt(ShadowNode& shadowNode) const override {
    auto& layoutableShadowNode = static_cast<YogaLayoutableShadowNode&>(shadowNode);
    auto& stateData =
        static_cast<const ModalHostViewShadowNode::ConcreteState&>(*shadowNode.getState())
            .getData();
    layoutableShadowNode.setSize(stateData.screenSize);
    layoutableShadowNode.setPositionType(YGPositionTypeAbsolute);
    ConcreteComponentDescriptor::adopt(shadowNode);
  }
};

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
      auto isVisible = [](const ShadowView& shadowView) {
        auto props = std::dynamic_pointer_cast<const ModalHostViewProps>(shadowView.props);
        return props && props->visible;
      };
      if (mutation.type == ShadowViewMutation::Insert &&
          std::string_view(mutation.newChildShadowView.componentName) == "ModalHostView" &&
          isVisible(mutation.newChildShadowView)) {
        auto emitter = std::dynamic_pointer_cast<const ModalHostViewEventEmitter>(
            mutation.newChildShadowView.eventEmitter);
        if (emitter) emitter->onShow({});
      } else if (mutation.type == ShadowViewMutation::Update &&
                 std::string_view(mutation.oldChildShadowView.componentName) == "ModalHostView" &&
                 isVisible(mutation.oldChildShadowView) != isVisible(mutation.newChildShadowView)) {
        auto emitter = std::dynamic_pointer_cast<const ModalHostViewEventEmitter>(
            mutation.newChildShadowView.eventEmitter);
        if (emitter) {
          if (isVisible(mutation.newChildShadowView)) emitter->onShow({});
          else emitter->onDismiss({});
        }
      } else if (mutation.type == ShadowViewMutation::Delete &&
                 std::string_view(mutation.oldChildShadowView.componentName) == "ModalHostView" &&
                 isVisible(mutation.oldChildShadowView)) {
        auto emitter = std::dynamic_pointer_cast<const ModalHostViewEventEmitter>(
            mutation.oldChildShadowView.eventEmitter);
        if (emitter) emitter->onDismiss({});
      }
      // Keep event emitters so the main thread can send events by tag.
      if (mutation.type == ShadowViewMutation::Create || mutation.type == ShadowViewMutation::Update) {
        animatedViews_[mutation.newChildShadowView.tag] = mutation.newChildShadowView;
        emitters_[mutation.newChildShadowView.tag] = mutation.newChildShadowView.eventEmitter;
        const auto componentName = std::string(mutation.newChildShadowView.componentName);
        if (componentName == "ScrollView") {
          auto state = std::dynamic_pointer_cast<const ConcreteState<ScrollViewState>>(
              mutation.newChildShadowView.state);
          if (state) scrollStates_[mutation.newChildShadowView.tag] = std::move(state);
        } else if (componentName == "ModalHostView") {
          auto state = std::dynamic_pointer_cast<const ConcreteState<ModalHostViewState>>(
              mutation.newChildShadowView.state);
          if (state) modalStates_[mutation.newChildShadowView.tag] = std::move(state);
        }
      } else if (mutation.type == ShadowViewMutation::Delete) {
        animatedViews_.erase(mutation.oldChildShadowView.tag);
        emitters_.erase(mutation.oldChildShadowView.tag);
        scrollStates_.erase(mutation.oldChildShadowView.tag);
        modalStates_.erase(mutation.oldChildShadowView.tag);
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

void GpuiMountingManager::synchronouslyUpdateViewOnUIThread(
    Tag tag,
    const folly::dynamic& props) {
  if (gpuiDebugAnimationEnabled()) {
    static std::atomic<uint64_t> calls{0};
    const auto call = ++calls;
    if (call <= 5 || call % 60 == 0) {
      LOG(INFO) << "[animated-props] sync tag=" << tag << " call=" << call
                << " props=" << folly::toJson(props);
    }
  }
  AnimatedPropsFlat update{};
  update.tag = tag;
  if (props.isObject()) {
    const auto* opacity = props.get_ptr("opacity");
    if (opacity != nullptr && opacity->isNumber()) {
      update.opacity = static_cast<float>(opacity->asDouble());
      update.has_opacity = true;
    }
    const auto* transform = props.get_ptr("transform");
    if (transform != nullptr && transform->isArray()) {
      // Use RN's parser and matrix composition, including operation order,
      // layout-dependent translations and transformOrigin. Extracting scalar
      // operations independently loses repeated operations and scale/translate order.
      ShadowView view;
      {
        std::lock_guard<std::mutex> lock(emittersMutex_);
        auto it = animatedViews_.find(tag);
        if (it == animatedViews_.end()) return;
        view = it->second;
      }
      auto baseProps = std::dynamic_pointer_cast<const BaseViewProps>(view.props);
      if (!baseProps) return;
      ContextContainer contextContainer;
      PropsParserContext context(view.surfaceId, contextContainer);
      Transform parsed;
      fromRawValue(context, RawValue(*transform), parsed);
      update.transform = BaseViewProps::resolveTransform(
          view.layoutMetrics.frame.size, parsed, baseProps->transformOrigin).matrix;
      update.has_transform = true;
    } else if (props.empty()) {
      // Native Animated restores the original view after disconnecting.
      update.reset_transform = true;
    }
  }
  if (update.has_opacity || update.has_transform || update.reset_transform) {
    if (gpuiDebugAnimationEnabled()) {
      static std::atomic<uint64_t> updates{0};
      const auto updateNumber = ++updates;
      if (updateNumber % 60 == 0) {
        LOG(INFO) << "[native-animated] applied animated props through Fabric: tag=" << tag
                  << " count=" << updateNumber << " opacity=" << update.opacity
                  << " transform=" << update.has_transform << " scale=(" << update.transform[0]
                  << ',' << update.transform[5] << ") translate=(" << update.transform[12] << ','
                  << update.transform[13] << ')';
      }
    }
    rn_gpui_on_animated_props(std::move(update));
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

void GpuiMountingManager::setWindowSize(float width, float height) {
  std::vector<std::shared_ptr<const ConcreteState<ModalHostViewState>>> states;
  {
    std::lock_guard<std::mutex> lock(emittersMutex_);
    states.reserve(modalStates_.size());
    for (const auto& [_, state] : modalStates_) {
      states.push_back(state);
    }
  }
  for (const auto& state : states) {
    state->updateState(ModalHostViewState(Size{width, height}));
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

void GpuiMountingManager::dispatchCommand(const ShadowView& view, const std::string& name, const folly::dynamic& args) {
  if (std::string_view(view.componentName) == "TextInput") {
    if (name == "focus") {
      rn_gpui_on_text_input_command(view.tag, true);
    } else if (name == "blur") {
      rn_gpui_on_text_input_command(view.tag, false);
    } else if (name == "clear") {
      rn_gpui_on_text_input_clear(view.tag);
    }
  }
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
    {
      std::lock_guard<std::mutex> lock(emittersMutex_);
      animatedViews_.clear();
      modalStates_.clear();
    }
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
      result->add(concreteComponentDescriptorProvider<TextInputComponentDescriptor>());
      result->add(concreteComponentDescriptorProvider<GpuiModalHostViewComponentDescriptor>());
      return result;
    }();
    return registry->createComponentDescriptorRegistry({eventDispatcher, contextContainer, nullptr});
  };
}

} // namespace rngpui
