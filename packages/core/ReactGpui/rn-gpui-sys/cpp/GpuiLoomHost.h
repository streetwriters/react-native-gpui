// The Loom renderer's host: it turns Loom's mount batches and per-node effects
// into the mutations GpuiMountingManager already applies to the Rust node
// store, and answers Loom's live queries. Compiled only with LOOM_RENDERER.
#pragma once

#if LOOM_RENDERER

#include "GpuiMountingManager.h"

#include <react/renderer/componentregistry/ComponentDescriptorRegistry.h>
#include <react/renderer/imagemanager/ImageManager.h>
#include <react/renderer/loom/binding/LoomEventManager.h>
#include <react/renderer/loom/host/LoomHost.h>
#include <react/renderer/loom/text/LoomTextLayoutManagerServices.h>
#include <react/renderer/mounting/ShadowView.h>
#include <react/renderer/scheduler/Scheduler.h>

#include <array>
#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace rngpui {

using facebook::react::LoomHost;

/// Text measurement over core's TextLayoutManager, with the text scale the
/// shadow tree would have applied.
class GpuiLoomTextServices final
    : public facebook::react::LoomTextLayoutManagerServices {
 public:
  GpuiLoomTextServices(
      std::shared_ptr<const facebook::react::ContextContainer> contextContainer,
      std::shared_ptr<const facebook::react::TextLayoutManager> layoutManager);

  facebook::react::TextAttributes parseTextAttributes(
      facebook::react::SurfaceId surfaceId,
      const std::string& componentName,
      const folly::dynamic& props,
      const facebook::react::TextAttributes& inherited,
      facebook::react::ParagraphAttributes& outParagraphAttributes) override;

  const std::shared_ptr<const facebook::react::TextLayoutManager>&
  layoutManager() const {
    return layoutManager_;
  }

 private:
  std::shared_ptr<const facebook::react::TextLayoutManager> layoutManager_;
  std::shared_ptr<const facebook::react::ContextContainer> contextContainer_;
};

class GpuiLoomHost final : public LoomHost,
                           public std::enable_shared_from_this<GpuiLoomHost> {
 public:
  /// Reads the scheduler of the running React instance, or does nothing when
  /// there is none (a reload is in progress).
  using SchedulerAccess =
      std::function<void(std::function<void(facebook::react::Scheduler&)>&&)>;
  /// Runs a function on the JavaScript thread (the calling one when
  /// JavaScript runs on the UI thread), or drops it when no instance is up.
  using JsAccess = std::function<void(std::function<void()>&&)>;

  ~GpuiLoomHost() override;
  GpuiLoomHost(
      std::shared_ptr<GpuiMountingManager> mountingManager,
      std::shared_ptr<const facebook::react::ContextContainer> contextContainer,
      SchedulerAccess schedulerAccess,
      JsAccess jsAccess);

  facebook::react::LoomPlatformTraits traits() const override;
  std::function<void(std::function<void()>)> uiExecutor() override;
  void applyBatch(
      facebook::react::SurfaceId surfaceId,
      facebook::react::LoomMountBatch batch) override;
  void failSurface(
      facebook::react::SurfaceId surfaceId,
      const std::string& reason) override;
  void updateViewProps(facebook::react::Tag tag, const folly::dynamic& props)
      override;
  void registerEventTarget(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag,
      facebook::react::InstanceHandle::Shared instanceHandle) override;
  void unregisterEventTarget(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag) override;
  void dispatchEvent(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag,
      const std::string& eventName,
      folly::dynamic payload,
      facebook::react::RawEvent::Category category,
      bool unique) override;
  void updateComponentState(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag,
      const std::shared_ptr<const facebook::react::State>& state) override;
  void updateTextState(
      const facebook::react::LoomTextStateUpdate& update) override;
  void updateScrollContentBounds(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag,
      const folly::dynamic& props,
      const facebook::react::Rect& bounds) override;
  void dispatchCommand(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag,
      const std::string& commandName,
      const folly::dynamic& args) override;
  std::pair<float, float> getScrollOffset(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag) override;
  std::optional<std::pair<float, float>> getViewLocationInSurface(
      facebook::react::SurfaceId surfaceId,
      facebook::react::Tag tag) override;
  facebook::react::LoomTextServices* textServices() override {
    return &text_;
  }

  /// A scroll position GPUI reports, kept for `getScrollOffset`.
  void setScrollOffset(facebook::react::Tag tag, float x, float y);
  void setPointScaleFactor(float scale);
  /// The size a surface's root was laid out at.
  std::optional<facebook::react::Size> surfaceContentSize(
      facebook::react::SurfaceId surfaceId);
  /// A React instance came up: Loom's callbacks may run again.
  void begin();
  /// Forgets every node: the React instance is going. Waits for a callback of
  /// the old instance that is running, and drops the ones not yet run, which
  /// would otherwise reach into a renderer that is being destroyed.
  void reset();
  /// Commits Loom is still computing, and tasks posted to the UI thread that
  /// have not run: work that will mount without anything having been queued.
  static std::uint64_t pending();

 private:
  struct Node {
    facebook::react::SurfaceId surfaceId{0};
    const facebook::react::ComponentDescriptor* descriptor{nullptr};
    bool viewless{false};
    bool created{false};
    bool dirty{false};
    facebook::react::Tag parent{-1};
    /// What the mounting manager last received, and what it should receive.
    facebook::react::ShadowView sent;
    facebook::react::ShadowView view;
    std::array<float, 4> contentInsets{};
    std::array<float, 4> overflowInsets{};
    /// What `onTextLayout` last reported for.
    facebook::react::State::Shared textLayoutState;
    facebook::react::Size textLayoutSize{};
  };

  bool ensureScheduler();
  Node* find(facebook::react::Tag tag);
  void markDirty(Node& node, facebook::react::Tag tag);
  void refreshDerived(Node& node, facebook::react::Tag tag);
  facebook::react::EventEmitter::Shared makeEmitter(
      const Node& node,
      facebook::react::Tag tag);
  void flushLocked(
      std::vector<facebook::react::ShadowViewMutation>&& leading,
      std::vector<facebook::react::ShadowViewMutation>&& structural);
  void scheduleFlush();
  void emitTextLayout(Node& node);
  void drop(facebook::react::Tag tag);

  std::shared_ptr<GpuiMountingManager> mountingManager_;
  std::shared_ptr<const facebook::react::ContextContainer> contextContainer_;
  SchedulerAccess schedulerAccess_;
  JsAccess jsAccess_;
  GpuiLoomTextServices text_;
  std::shared_ptr<facebook::react::ImageManager> imageManager_;

  std::recursive_mutex mutex_;
  std::shared_mutex lifetimeMutex_;
  bool alive_{true};
  std::shared_ptr<const facebook::react::ComponentDescriptorRegistry> registry_;
  std::shared_ptr<facebook::react::LoomEventManager> eventManager_;
  std::unordered_map<facebook::react::Tag, Node> nodes_;
  std::unordered_set<facebook::react::Tag> viewless_;
  std::unordered_set<facebook::react::Tag> replaced_;
  std::unordered_set<facebook::react::Tag> dirty_;
  std::unordered_map<
      facebook::react::Tag,
      facebook::react::InstanceHandle::Shared>
      instanceHandles_;
  /// Keeps the event emitter of a node alive; the emitter does not own its
  /// family.
  std::unordered_map<
      facebook::react::Tag,
      facebook::react::ShadowNodeFamily::Shared>
      families_;
  std::unordered_map<facebook::react::Tag, facebook::react::State::Shared>
      pendingStates_;
  std::unordered_map<facebook::react::Tag, std::pair<float, float>>
      scrollOffsets_;
  bool flushScheduled_{false};
  static inline std::atomic<std::uint64_t> pendingUiTasks_{0};
  static inline std::atomic<GpuiLoomHost*> active_{nullptr};
  float pointScaleFactor_{1.f};
};

} // namespace rngpui

#endif // LOOM_RENDERER
