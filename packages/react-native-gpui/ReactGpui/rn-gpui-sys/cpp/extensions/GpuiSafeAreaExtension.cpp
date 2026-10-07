// Safe-area glue (@react-native-gpui/safe-area-context). Compiled into
// rn_gpui_extensions only when the package is present. Emits insetsChange
// to RNCSafeAreaProvider views and applies the window top inset.
#include "GPUISafeAreaInsets.h"
#include "GpuiExtensions.h"

#include <react/renderer/components/safeareacontext/RNCSafeAreaViewState.h>
#include <react/renderer/core/ConcreteState.h>

#include <folly/json.h>
#include <glog/logging.h>
#include <array>
#include <string_view>

namespace rngpui {

using namespace facebook::react;

void rn_gpui_install_safe_area_extension() {
  auto& hooks = gpuiExtensionHooks().safeArea;
  hooks.viewFrameChanged = [](SurfaceId surfaceId,
                              const ShadowView& view,
                              GpuiMountedViews& views) {
    if (std::string_view(view.componentName) != "RNCSafeAreaProvider") {
      return;
    }
    const auto& frame = view.layoutMetrics.frame;
    const std::array<float, 4> nextFrame = {
        frame.origin.x, frame.origin.y, frame.size.width, frame.size.height};
    const auto previous = views.safeAreaFrames.find(view.tag);
    if (previous != views.safeAreaFrames.end() &&
        previous->second == nextFrame) {
      return;
    }
    views.safeAreaFrames[view.tag] = nextFrame;
    const auto insets =
        gpui_safe_area::gpui_safe_area_insets(static_cast<int32_t>(surfaceId));
    folly::dynamic insetPayload = folly::dynamic::object("top", insets.top)(
        "right", insets.right)("bottom", insets.bottom)("left", insets.left);
    folly::dynamic framePayload =
        folly::dynamic::object("x", frame.origin.x)("y", frame.origin.y)(
            "width", frame.size.width)("height", frame.size.height);
    if (view.eventEmitter) {
      LOG(INFO) << "[gpui-safe-area] onInsetsChange tag=" << view.tag
                << " surface=" << surfaceId << " frame=(" << frame.origin.x
                << ',' << frame.origin.y << ' ' << frame.size.width << 'x'
                << frame.size.height << ')';
      view.eventEmitter->dispatchEvent(
          "insetsChange",
          folly::dynamic::object("insets", std::move(insetPayload))(
              "frame", std::move(framePayload)));
    }
  };
  hooks.viewDeleted = [](Tag tag, GpuiMountedViews& views) {
    views.safeAreaFrames.erase(tag);
  };
  hooks.windowTopInset = [](float top, GpuiMountedViews& views) {
    const auto previous = gpui_safe_area::windowTopInset.exchange(top);
    std::vector<std::shared_ptr<const ConcreteState<RNCSafeAreaViewState>>>
        states;
    {
      std::lock_guard<std::mutex> lock(views.emittersMutex);
      if (previous != top) {
        for (const auto& [tag, frame] : views.safeAreaFrames) {
          const auto emitter = views.emitters.find(tag);
          if (emitter == views.emitters.end() || !emitter->second)
            continue;
          emitter->second->dispatchEvent(
              "insetsChange",
              folly::dynamic::object(
                  "insets",
                  folly::dynamic::object("top", top)("right", 0)("bottom", 0)(
                      "left", 0))(
                  "frame",
                  folly::dynamic::object("x", frame[0])("y", frame[1])(
                      "width", frame[2])("height", frame[3])));
        }
      }
      for (const auto& [_, view] : views.animatedViews) {
        if (std::string_view(view.componentName) != "RNCSafeAreaView")
          continue;
        if (auto state = std::dynamic_pointer_cast<
                const ConcreteState<RNCSafeAreaViewState>>(view.state))
          if (state->getData().insets.top != top)
            states.push_back(std::move(state));
      }
    }
    for (const auto& state : states) {
      auto next = state->getData();
      next.insets.top = top;
      state->updateState(std::move(next));
    }
  };
  hooks.afterMount = [](GpuiMountedViews& views) {
    gpuiExtensionHooks().safeArea.windowTopInset(
        gpui_safe_area::windowTopInset.load(), views);
  };
}

} // namespace rngpui
