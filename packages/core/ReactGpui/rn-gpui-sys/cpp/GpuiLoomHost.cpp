#if LOOM_RENDERER

#include "GpuiLoomHost.h"

#include "GpuiTurboModule.h"
#include "react/coremodules/DeviceInfoModule.h"
#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge

#include <folly/system/ThreadName.h>
#include <glog/logging.h>
#include <react/loom/Loom.h>
#include <react/renderer/components/image/ImageProps.h>
#include <react/renderer/components/image/ImageShadowNode.h>
#include <react/renderer/components/image/ImageState.h>
#include <react/renderer/components/iostextinput/TextInputProps.h>
#include <react/renderer/components/scrollview/ScrollViewShadowNode.h>
#include <react/renderer/components/scrollview/ScrollViewState.h>
#include <react/renderer/components/text/BaseParagraphProps.h>
#include <react/renderer/components/text/ParagraphEventEmitter.h>
#include <react/renderer/components/text/ParagraphShadowNode.h>
#include <react/renderer/components/text/ParagraphState.h>
#include <react/renderer/components/textinput/TextInputState.h>
#include <react/renderer/components/view/BaseViewProps.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/ShadowNodeFamily.h>
#include <react/renderer/loom/binding/LoomBinding.h>

#include <algorithm>
#include <cmath>
#include <iterator>
#include <limits>

namespace rngpui {

using namespace facebook::react;

namespace {

constexpr size_t kWorkerStackSize = 2 * 1024 * 1024;

void logLoom(LoomLogLevel level, const char* tag, const char* message) {
  const auto line = std::string(tag) + ": " + message;
  rn_gpui_log(level == LoomLogLevel::Warn ? 2 : 0, line);
}

} // namespace

GpuiLoomTextServices::GpuiLoomTextServices(
    std::shared_ptr<const ContextContainer> contextContainer,
    std::shared_ptr<const TextLayoutManager> layoutManager)
    : LoomTextLayoutManagerServices(
          contextContainer,
          layoutManager,
          /*measurableOnWorker=*/true),
      layoutManager_(std::move(layoutManager)),
      contextContainer_(contextContainer) {}

TextAttributes GpuiLoomTextServices::parseTextAttributes(
    SurfaceId surfaceId,
    const std::string& componentName,
    const folly::dynamic& props,
    const TextAttributes& inherited,
    ParagraphAttributes& outParagraphAttributes) {
  // The shadow tree takes the text scale from the layout context; here it is
  // the one input the attributes still lack.
  auto adjusted = inherited;
  adjusted.fontSizeMultiplier = DeviceInfoModule::fontScale();
  if (componentNameByReactViewName(componentName) == "TextInput") {
    // The input's font comes from its own props, as its shadow node reads them.
    static const RawPropsParser parser = [] {
      RawPropsParser prepared;
      prepared.prepare<TextInputProps>();
      return prepared;
    }();
    const PropsParserContext context{surfaceId, *contextContainer_};
    RawProps rawProps{props};
    rawProps.parse(parser);
    const TextInputProps parsed{context, TextInputProps{}, rawProps};
    adjusted.apply(
        parsed.getEffectiveTextAttributes(adjusted.fontSizeMultiplier));
    outParagraphAttributes = parsed.paragraphAttributes;
    return adjusted;
  }
  return LoomTextLayoutManagerServices::parseTextAttributes(
      surfaceId, componentName, props, adjusted, outParagraphAttributes);
}

GpuiLoomHost::GpuiLoomHost(
    std::shared_ptr<GpuiMountingManager> mountingManager,
    std::shared_ptr<const ContextContainer> contextContainer,
    SchedulerAccess schedulerAccess,
    JsAccess jsAccess)
    : mountingManager_(std::move(mountingManager)),
      contextContainer_(contextContainer),
      schedulerAccess_(std::move(schedulerAccess)),
      jsAccess_(std::move(jsAccess)),
      text_(
          contextContainer,
          std::make_shared<const TextLayoutManager>(contextContainer)),
      imageManager_(std::make_shared<ImageManager>(contextContainer)) {
  active_.store(this, std::memory_order_release);
  setMountPendingProbe(&GpuiLoomHost::pending);
}

GpuiLoomHost::~GpuiLoomHost() {
  auto* expected = this;
  active_.compare_exchange_strong(expected, nullptr);
}

std::uint64_t GpuiLoomHost::pending() {
  std::uint64_t count = pendingUiTasks_.load(std::memory_order_relaxed);
  auto* host = active_.load(std::memory_order_acquire);
  if (host == nullptr) {
    return count;
  }
  // A read never blocks and finds nothing while a commit is being computed.
  if (const auto runtime = loom::Runtime::from(*host->contextContainer_)) {
    runtime->forEachSurface([&](SurfaceId surfaceId) {
      if (!runtime->latest().surfaceSize(surfaceId)) {
        ++count;
      }
    });
  }
  return count;
}

namespace {
// React names components by their view manager (`RCTText`); the descriptor
// registry knows them by Fabric name. The core classifies by the name a node
// was created with, so both spellings are listed.
LoomComponentTable componentTable() {
  using Role = LoomComponentTable::Role;
  auto table = LoomComponentTable::fabric();
  const auto add = [&](const char* name,
                       uint16_t roles,
                       LoomTextStateKind kind = LoomTextStateKind::Other) {
    table.entries[name] = LoomComponentTable::Entry{roles, kind};
  };
  add("RCTView", Role::Box);
  add("RCTText", Role::Paragraph, LoomTextStateKind::Paragraph);
  add("RCTSelectableText",
      Role::Paragraph,
      LoomTextStateKind::SelectableParagraph);
  add("RCTVirtualText", Role::VirtualText);
  add("RCTRawText", Role::RawText);
  add("RCTScrollView", Role::GenericStateWrapper);
  // The core asks for a Fabric name's counterpart among the names JavaScript
  // creates nodes with.
  auto& host = table.hostNames;
  host["View"] = "RCTView";
  host["Image"] = "RCTImageView";
  host["ScrollView"] = "RCTScrollView";
  host["Paragraph"] = "RCTText";
  host["SelectableParagraph"] = "RCTSelectableText";
  host["RawText"] = "RCTRawText";
  table.rawTextHostName = "RCTRawText";
  return table;
}
} // namespace

LoomPlatformTraits GpuiLoomHost::traits() const {
  LoomPlatformTraits traits;
  traits.components = componentTable();
  traits.isUIThread = [] { return rn_gpui_is_main_thread(); };
  traits.workerStackSize = kWorkerStackSize;
  traits.workerThreadName = "loom-worker";
  traits.setCurrentThreadName = [](const char* name) {
    folly::setThreadName(name);
  };
  traits.log = logLoom;
  return traits;
}

std::function<void(std::function<void()>)> GpuiLoomHost::uiExecutor() {
  return [weak = weak_from_this()](std::function<void()> task) {
    pendingUiTasks_.fetch_add(1, std::memory_order_relaxed);
    dispatchMain([weak, task = std::move(task)] {
      if (const auto self = weak.lock()) {
        std::shared_lock<std::shared_mutex> alive(self->lifetimeMutex_);
        if (self->alive_) {
          task();
        }
      }
      pendingUiTasks_.fetch_sub(1, std::memory_order_relaxed);
    });
  };
}

bool GpuiLoomHost::ensureScheduler() {
  if (registry_ != nullptr && eventManager_ != nullptr) {
    return true;
  }
  schedulerAccess_([this](Scheduler& scheduler) {
    registry_ = scheduler.getComponentDescriptorRegistry();
    if (auto dispatcher = scheduler.getEventDispatcher()) {
      eventManager_ = std::make_shared<LoomEventManager>(std::move(dispatcher));
    }
  });
  return registry_ != nullptr;
}

GpuiLoomHost::Node* GpuiLoomHost::find(Tag tag) {
  const auto found = nodes_.find(tag);
  return found == nodes_.end() ? nullptr : &found->second;
}

void GpuiLoomHost::markDirty(Node& node, Tag tag) {
  node.dirty = true;
  dirty_.insert(tag);
}

EventEmitter::Shared GpuiLoomHost::makeEmitter(const Node& node, Tag tag) {
  const auto handle = instanceHandles_.find(tag);
  if (handle == instanceHandles_.end() || node.descriptor == nullptr) {
    return nullptr;
  }
  auto family = node.descriptor->createFamily(
      ShadowNodeFamilyFragment{tag, node.surfaceId, handle->second});
  auto emitter = family->getEventEmitter();
  emitter->getEventTarget()->setEnabled(true);
  families_[tag] = std::move(family);
  return emitter;
}

// Everything the mounting side reads from a node that Loom does not send:
// resolved border widths, the content insets, and an Image's request.
void GpuiLoomHost::refreshDerived(Node& node, Tag tag) {
  auto& metrics = node.view.layoutMetrics;
  metrics.pointScaleFactor = pointScaleFactor_;
  metrics.contentInsets = {
      node.contentInsets[0],
      node.contentInsets[1],
      node.contentInsets[2],
      node.contentInsets[3]};
  metrics.overflowInset = {
      node.overflowInsets[0],
      node.overflowInsets[1],
      node.overflowInsets[2],
      node.overflowInsets[3]};
  if (const auto viewProps =
          std::dynamic_pointer_cast<const BaseViewProps>(node.view.props)) {
    const auto widths = viewProps->getBorderWidths().resolve(
        metrics.layoutDirection == LayoutDirection::RightToLeft, 0);
    metrics.borderWidth = {
        widths.left, widths.top, widths.right, widths.bottom};
  }
  if (std::string_view(node.view.componentName) != "Image") {
    return;
  }
  const auto imageProps =
      std::dynamic_pointer_cast<const ImageProps>(node.view.props);
  if (!imageProps) {
    return;
  }
  const auto contentSize = metrics.getContentFrame().size;
  const auto scale = metrics.pointScaleFactor;
  ImageSource source{ImageSource::Type::Invalid};
  if (imageProps->sources.size() == 1) {
    source = imageProps->sources.front();
    source.size = contentSize;
    source.scale = scale;
  } else if (!imageProps->sources.empty()) {
    const auto targetArea =
        contentSize.width * contentSize.height * scale * scale;
    auto bestFit = std::numeric_limits<Float>::infinity();
    for (const auto& candidate : imageProps->sources) {
      const auto candidateScale =
          candidate.scale == 0 ? scale : candidate.scale;
      const auto candidateArea = candidate.size.width * candidate.size.height *
          candidateScale * candidateScale;
      const auto fit = std::abs(1 - candidateArea / targetArea);
      if (fit < bestFit) {
        bestFit = fit;
        source = candidate;
      }
    }
    source.size = contentSize;
    source.scale = scale;
  }
  const ImageRequestParams params{imageProps->blurRadius};
  if (const auto previous =
          std::dynamic_pointer_cast<const ImageShadowNode::ConcreteState>(
              node.view.state)) {
    if (previous->getData().getImageSource() == source &&
        previous->getData().getImageRequestParams() == params) {
      return;
    }
  }
  ImageState state{
      source,
      imageManager_->requestImage(source, node.surfaceId, params, tag),
      params};
  node.view.state = std::make_shared<const ImageShadowNode::ConcreteState>(
      std::make_shared<const ImageState>(std::move(state)),
      ShadowNodeFamily::Weak{});
}

void GpuiLoomHost::drop(Tag tag) {
  nodes_.erase(tag);
  viewless_.erase(tag);
  dirty_.erase(tag);
  pendingStates_.erase(tag);
  scrollOffsets_.erase(tag);
}

void GpuiLoomHost::applyBatch(SurfaceId surfaceId, LoomMountBatch batch) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  if (!ensureScheduler()) {
    return;
  }
  const PropsParserContext context{surfaceId, *contextContainer_};

  std::vector<ShadowViewMutation> leading;
  std::vector<ShadowViewMutation> removes;
  std::vector<ShadowViewMutation> deletes;
  std::vector<ShadowViewMutation> inserts;
  std::vector<Tag> created;

  auto parse = [&](const ComponentDescriptor& descriptor,
                   const std::shared_ptr<const Props>& parsed,
                   const folly::dynamic& raw) -> Props::Shared {
    return parsed != nullptr
        ? parsed
        : descriptor.cloneProps(context, nullptr, RawProps(raw));
  };

  auto apply = [&](const auto& operation) {
    using Operation = std::decay_t<decltype(operation)>;
    if constexpr (std::is_same_v<Operation, DirectCreateOperation>) {
      const auto tag = operation.tag;
      if (auto* previous = find(tag)) {
        // The tag is created again in the batch that deletes its previous
        // incarnation, so the old node goes first and the delete that follows
        // must leave the new one alone.
        if (previous->created) {
          leading.push_back(ShadowViewMutation::DeleteMutation(previous->sent));
        }
        nodes_.erase(tag);
        dirty_.erase(tag);
        replaced_.insert(tag);
      } else if (viewless_.erase(tag) != 0) {
        replaced_.insert(tag);
      }
      if (!operation.layoutable) {
        viewless_.insert(tag);
        return;
      }
      const ComponentDescriptor* descriptor = nullptr;
      try {
        descriptor = &registry_->at(operation.componentName);
      } catch (const std::exception& error) {
        LOG(ERROR) << "Loom: no component descriptor for "
                   << operation.componentName << ": " << error.what();
        viewless_.insert(tag);
        return;
      }
      Node node;
      node.surfaceId = surfaceId;
      node.descriptor = descriptor;
      node.view.componentName = descriptor->getComponentName();
      node.view.componentHandle = descriptor->getComponentHandle();
      node.view.traits = descriptor->getTraits();
      node.view.surfaceId = surfaceId;
      node.view.tag = tag;
      node.view.layoutMetrics = LayoutMetrics{};
      node.view.props =
          parse(*descriptor, operation.parsedProps, operation.props);
      if (const auto pending = pendingStates_.find(tag);
          pending != pendingStates_.end()) {
        node.view.state = std::move(pending->second);
        pendingStates_.erase(pending);
      }
      node.view.eventEmitter = makeEmitter(node, tag);
      refreshDerived(node, tag);
      nodes_[tag] = std::move(node);
      created.push_back(tag);
    } else if constexpr (std::
                             is_same_v<Operation, DirectUpdatePropsOperation>) {
      auto* node = find(operation.tag);
      if (node == nullptr) {
        return;
      }
      node->view.props =
          parse(*node->descriptor, operation.parsedProps, operation.props);
      refreshDerived(*node, operation.tag);
      markDirty(*node, operation.tag);
    } else if constexpr (std::is_same_v<Operation, DirectRemoveOperation>) {
      if (auto* node = find(operation.tag); node != nullptr && node->created) {
        removes.push_back(ShadowViewMutation::RemoveMutation(
            operation.parentTag,
            node->sent,
            static_cast<int>(operation.index)));
      }
    } else if constexpr (std::is_same_v<Operation, DirectInsertOperation>) {
      if (auto* node = find(operation.tag)) {
        node->parent = operation.parentTag;
        inserts.push_back(ShadowViewMutation::InsertMutation(
            operation.parentTag,
            node->view,
            static_cast<int>(operation.index)));
        node->sent = node->view;
        node->created = true;
      }
    } else if constexpr (std::is_same_v<Operation, DirectPaddingOperation>) {
      if (auto* node = find(operation.tag)) {
        node->contentInsets = operation.insets;
        refreshDerived(*node, operation.tag);
        markDirty(*node, operation.tag);
      }
    } else if constexpr (std::is_same_v<
                             Operation,
                             DirectOverflowInsetOperation>) {
      if (auto* node = find(operation.tag)) {
        node->overflowInsets = operation.insets;
        refreshDerived(*node, operation.tag);
        markDirty(*node, operation.tag);
      }
    } else if constexpr (std::is_same_v<Operation, DirectLayoutOperation>) {
      if (auto* node = find(operation.tag)) {
        auto& metrics = node->view.layoutMetrics;
        metrics.frame = {
            {operation.x, operation.y}, {operation.width, operation.height}};
        metrics.displayType = static_cast<DisplayType>(operation.displayType);
        metrics.layoutDirection = operation.layoutDirection == 2
            ? LayoutDirection::RightToLeft
            : LayoutDirection::LeftToRight;
        node->parent = operation.parentTag;
        refreshDerived(*node, operation.tag);
        markDirty(*node, operation.tag);
      }
    } else if constexpr (std::is_same_v<Operation, DirectDeleteOperation>) {
      const auto tag = operation.tag;
      if (replaced_.erase(tag) != 0) {
        return;
      }
      if (auto* node = find(tag)) {
        if (node->created) {
          deletes.push_back(ShadowViewMutation::DeleteMutation(node->sent));
        }
      }
      drop(tag);
    }
  };

  for (const auto& phase : batch.phaseOperationIndexes) {
    for (const auto index : phase) {
      std::visit(apply, batch.operations.at(index));
    }
  }
  replaced_.clear();

  std::vector<ShadowViewMutation> creates;
  creates.reserve(created.size());
  for (const auto tag : created) {
    if (auto* node = find(tag)) {
      creates.push_back(ShadowViewMutation::CreateMutation(node->view));
      node->sent = node->view;
      node->created = true;
      node->dirty = false;
      dirty_.erase(tag);
    }
  }
  // An insert recorded its node's view before layout and state reached it;
  // what the node holds now is what the mounting side must see.
  for (auto& mutation : inserts) {
    if (auto* node = find(mutation.newChildShadowView.tag)) {
      mutation.newChildShadowView = node->view;
      node->sent = node->view;
    }
  }

  std::vector<ShadowViewMutation> structural;
  structural.reserve(
      removes.size() + deletes.size() + creates.size() + inserts.size());
  for (auto* group : {&removes, &deletes, &creates, &inserts}) {
    std::move(group->begin(), group->end(), std::back_inserter(structural));
  }
  flushLocked(std::move(leading), std::move(structural));
}

// Delivers `structural` for the surface that owns it, followed by an update for
// every node an effect or an operation changed since it was last delivered.
void GpuiLoomHost::flushLocked(
    std::vector<ShadowViewMutation>&& leading,
    std::vector<ShadowViewMutation>&& structural) {
  std::unordered_map<SurfaceId, ShadowViewMutationList> bySurface;
  auto surfaceOf = [](const ShadowViewMutation& mutation) {
    return mutation.type == ShadowViewMutation::Delete ||
            mutation.type == ShadowViewMutation::Remove
        ? mutation.oldChildShadowView.surfaceId
        : mutation.newChildShadowView.surfaceId;
  };
  for (auto* group : {&leading, &structural}) {
    for (auto& mutation : *group) {
      bySurface[surfaceOf(mutation)].push_back(std::move(mutation));
    }
  }
  for (const auto tag : dirty_) {
    auto* node = find(tag);
    if (node == nullptr || !node->created) {
      continue;
    }
    bySurface[node->surfaceId].push_back(ShadowViewMutation::UpdateMutation(
        node->sent, node->view, node->parent));
    node->sent = node->view;
    node->dirty = false;
  }
  dirty_.clear();
  flushScheduled_ = false;
  std::vector<Tag> shown;
  for (auto& [surfaceId, mutations] : bySurface) {
    if (mutations.empty()) {
      continue;
    }
    for (const auto& mutation : mutations) {
      if (mutation.type == ShadowViewMutation::Create ||
          mutation.type == ShadowViewMutation::Update) {
        shown.push_back(mutation.newChildShadowView.tag);
      }
    }
    mountingManager_->applyMutations(surfaceId, mutations);
  }
  for (const auto tag : shown) {
    if (auto* node = find(tag)) {
      emitTextLayout(*node);
    }
  }
}

// Fabric's paragraph reports its wrapped lines after each layout.
void GpuiLoomHost::emitTextLayout(Node& node) {
  const auto props =
      std::dynamic_pointer_cast<const BaseParagraphProps>(node.view.props);
  const auto state =
      std::dynamic_pointer_cast<const ParagraphShadowNode::ConcreteState>(
          node.view.state);
  const auto emitter = std::dynamic_pointer_cast<const ParagraphEventEmitter>(
      node.view.eventEmitter);
  if (!props || !props->onTextLayout || !state || !emitter) {
    return;
  }
  const auto size = node.view.layoutMetrics.getContentFrame().size;
  if (node.textLayoutState == state && node.textLayoutSize == size) {
    return;
  }
  node.textLayoutState = state;
  node.textLayoutSize = size;
  const auto& data = state->getData();
  emitter->onTextLayout(text_.layoutManager()->measureLines(
      AttributedStringBox{data.attributedString},
      data.paragraphAttributes,
      size));
}

void GpuiLoomHost::scheduleFlush() {
  if (flushScheduled_) {
    return;
  }
  flushScheduled_ = true;
  dispatchMain([weak = weak_from_this()] {
    if (auto self = weak.lock()) {
      std::lock_guard<std::recursive_mutex> lock(self->mutex_);
      if (self->flushScheduled_) {
        self->flushLocked({}, {});
      }
    }
  });
}

void GpuiLoomHost::failSurface(SurfaceId surfaceId, const std::string& reason) {
  LOG(ERROR) << "Loom stopped surface " << surfaceId << ": " << reason;
}

void GpuiLoomHost::updateViewProps(Tag tag, const folly::dynamic& props) {
  LoomBinding::recordNativeProps(tag, props);
  mountingManager_->synchronouslyUpdateViewOnUIThread(tag, props);
}

void GpuiLoomHost::registerEventTarget(
    SurfaceId surfaceId,
    Tag tag,
    InstanceHandle::Shared instanceHandle) {
  if (!instanceHandle) {
    return;
  }
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  if (!ensureScheduler()) {
    return;
  }
  instanceHandles_[tag] = instanceHandle;
  eventManager_->registerTarget(surfaceId, tag, instanceHandle);
  if (auto* node = find(tag)) {
    node->view.eventEmitter = makeEmitter(*node, tag);
    mountingManager_->setEventEmitter(tag, node->view.eventEmitter);
    markDirty(*node, tag);
    scheduleFlush();
  }
}

// A node's instance handle wraps a weak JavaScript object, which JSI only lets
// go of on the JavaScript thread. The emitters the Rust store holds can outlive
// the node, so they are disabled (which drops their event target), and the
// references this host holds are released on the JavaScript thread.
void GpuiLoomHost::unregisterEventTarget(SurfaceId surfaceId, Tag tag) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  auto manager = eventManager_;
  auto handle = std::move(instanceHandles_[tag]);
  instanceHandles_.erase(tag);
  ShadowNodeFamily::Shared family;
  if (const auto found = families_.find(tag); found != families_.end()) {
    family = std::move(found->second);
    families_.erase(found);
    family->getEventEmitter()->setEnabled(false);
  }
  jsAccess_([manager = std::move(manager),
             handle = std::move(handle),
             family = std::move(family),
             surfaceId,
             tag] {
    if (manager) {
      manager->unregisterTarget(surfaceId, tag);
    }
  });
}

void GpuiLoomHost::dispatchEvent(
    SurfaceId surfaceId,
    Tag tag,
    const std::string& eventName,
    folly::dynamic payload,
    RawEvent::Category category,
    bool unique) {
  std::shared_ptr<LoomEventManager> manager;
  {
    std::lock_guard<std::recursive_mutex> lock(mutex_);
    manager = eventManager_;
  }
  if (manager) {
    manager->dispatch(
        surfaceId,
        tag,
        eventName,
        std::move(payload),
        category,
        unique,
        HighResTimeStamp::now());
  }
}

void GpuiLoomHost::updateComponentState(
    SurfaceId /*surfaceId*/,
    Tag tag,
    const std::shared_ptr<const State>& state) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  if (auto* node = find(tag)) {
    node->view.state = state;
    markDirty(*node, tag);
    scheduleFlush();
  } else {
    pendingStates_[tag] = state;
  }
}

void GpuiLoomHost::updateTextState(const LoomTextStateUpdate& update) {
  if (update.attributedString == nullptr) {
    return;
  }
  State::Shared state;
  if (update.kind == LoomTextStateKind::Text ||
      update.kind == LoomTextStateKind::Paragraph) {
    state = std::make_shared<const ParagraphShadowNode::ConcreteState>(
        std::make_shared<const ParagraphState>(ParagraphState{
            .attributedString = *update.attributedString,
            .paragraphAttributes = update.paragraphAttributes,
            .layoutManager = text_.layoutManager()}),
        ShadowNodeFamily::Weak{});
  } else if (update.kind == LoomTextStateKind::TextInput) {
    state = std::make_shared<const ConcreteState<TextInputState>>(
        std::make_shared<const TextInputState>(TextInputState{
            AttributedStringBox{*update.attributedString},
            AttributedString{},
            update.paragraphAttributes,
            update.mostRecentEventCount}),
        ShadowNodeFamily::Weak{});
  } else {
    return;
  }
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  if (auto* node = find(update.tag)) {
    node->view.state = std::move(state);
    markDirty(*node, update.tag);
    scheduleFlush();
  } else {
    pendingStates_[update.tag] = std::move(state);
  }
}

void GpuiLoomHost::updateScrollContentBounds(
    SurfaceId /*surfaceId*/,
    Tag tag,
    const folly::dynamic& props,
    const Rect& bounds) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Point offset{};
  if (const auto live = scrollOffsets_.find(tag);
      live != scrollOffsets_.end()) {
    offset = {live->second.first, live->second.second};
  } else if (props.isObject() && props.count("contentOffset") != 0) {
    const auto& requested = props["contentOffset"];
    if (requested.isObject()) {
      const auto* x = requested.get_ptr("x");
      const auto* y = requested.get_ptr("y");
      if (x != nullptr && x->isNumber()) {
        offset.x = static_cast<Float>(x->asDouble());
      }
      if (y != nullptr && y->isNumber()) {
        offset.y = static_cast<Float>(y->asDouble());
      }
    }
  }
  auto state = std::make_shared<const ScrollViewShadowNode::ConcreteState>(
      std::make_shared<const ScrollViewState>(
          ScrollViewState{offset, bounds, 0}),
      ShadowNodeFamily::Weak{});
  if (auto* node = find(tag)) {
    node->view.state = std::move(state);
    markDirty(*node, tag);
    scheduleFlush();
  } else {
    pendingStates_[tag] = std::move(state);
  }
}

void GpuiLoomHost::dispatchCommand(
    SurfaceId /*surfaceId*/,
    Tag tag,
    const std::string& commandName,
    const folly::dynamic& args) {
  ShadowView view;
  {
    std::lock_guard<std::recursive_mutex> lock(mutex_);
    auto* node = find(tag);
    if (node == nullptr) {
      return;
    }
    view = node->view;
  }
  mountingManager_->dispatchCommand(view, commandName, args);
}

std::pair<float, float> GpuiLoomHost::getScrollOffset(
    SurfaceId /*surfaceId*/,
    Tag tag) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  const auto found = scrollOffsets_.find(tag);
  return found == scrollOffsets_.end() ? std::pair<float, float>{0, 0}
                                       : found->second;
}

std::optional<std::pair<float, float>> GpuiLoomHost::getViewLocationInSurface(
    SurfaceId /*surfaceId*/,
    Tag tag) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  auto* node = find(tag);
  if (node == nullptr || !node->created) {
    return std::nullopt;
  }
  float x = 0;
  float y = 0;
  Tag current = tag;
  // The frames are relative to the parent; a scrolled ancestor moves what it
  // holds by its offset.
  for (int depth = 0; node != nullptr && depth < 4096; ++depth) {
    const auto& frame = node->view.layoutMetrics.frame;
    x += frame.origin.x;
    y += frame.origin.y;
    current = node->parent;
    if (const auto offset = scrollOffsets_.find(current);
        offset != scrollOffsets_.end()) {
      x -= offset->second.first;
      y -= offset->second.second;
    }
    node = find(current);
  }
  return std::pair<float, float>{x, y};
}

void GpuiLoomHost::setScrollOffset(Tag tag, float x, float y) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  scrollOffsets_[tag] = {x, y};
  if (auto* node = find(tag)) {
    if (const auto state = std::dynamic_pointer_cast<
            const ScrollViewShadowNode::ConcreteState>(node->view.state)) {
      const auto& data = state->getData();
      node->view.state =
          std::make_shared<const ScrollViewShadowNode::ConcreteState>(
              std::make_shared<const ScrollViewState>(ScrollViewState{
                  {x, y}, data.contentBoundingRect, data.scrollAwayPaddingTop}),
              ShadowNodeFamily::Weak{});
      markDirty(*node, tag);
      scheduleFlush();
    }
  }
}

void GpuiLoomHost::setPointScaleFactor(float scale) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  pointScaleFactor_ = scale;
  text_.setPointScaleFactor(scale);
  LoomBinding::setPointScaleFactor(scale);
}

std::optional<Size> GpuiLoomHost::surfaceContentSize(SurfaceId surfaceId) {
  const auto runtime = loom::Runtime::from(*contextContainer_);
  if (!runtime) {
    return std::nullopt;
  }
  return runtime->latest().surfaceSize(surfaceId);
}

// Called with the JavaScript thread stopped and its runtime still alive: the
// Rust store holds these emitters until it drops the old tree, which is after
// the runtime is gone, so they let go of their event targets here.
void GpuiLoomHost::begin() {
  std::unique_lock<std::shared_mutex> alive(lifetimeMutex_);
  alive_ = true;
}

void GpuiLoomHost::reset() {
  {
    std::unique_lock<std::shared_mutex> alive(lifetimeMutex_);
    alive_ = false;
  }
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  for (const auto& [tag, family] : families_) {
    family->getEventEmitter()->setEnabled(false);
  }
  registry_ = nullptr;
  eventManager_ = nullptr;
  nodes_.clear();
  viewless_.clear();
  replaced_.clear();
  dirty_.clear();
  instanceHandles_.clear();
  families_.clear();
  pendingStates_.clear();
  scrollOffsets_.clear();
  flushScheduled_ = false;
}

} // namespace rngpui

#endif // LOOM_RENDERER
