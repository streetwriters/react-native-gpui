#include "GpuiModules.h"
#include "MountBatchBuilder.h"

#include <react/renderer/components/rnscreens/Props.h>

#include <algorithm>

namespace rngpui {
using namespace facebook::react;

void rn_gpui_install_screens_module() {
  auto& hooks = gpuiModuleHooks();
  hooks.screensOp = [](const ShadowView& shadowView, MountOp& op) {
    if (op.component == "RNSScreenStackHeaderSubview") {
      if (auto props =
              std::dynamic_pointer_cast<const RNSScreenStackHeaderSubviewProps>(
                  shadowView.props)) {
        op.screen_header_subview_type = toString(props->type);
      }
    } else if (op.component == "RNSScreenStackHeaderConfig") {
      if (auto props =
              std::dynamic_pointer_cast<const RNSScreenStackHeaderConfigProps>(
                  shadowView.props)) {
        op.screen_header_title = props->title;
        op.screen_header_background_color = argb(props->backgroundColor);
        op.screen_header_title_color = argb(props->titleColor);
        op.screen_header_tint_color = argb(props->color);
        op.screen_header_hidden = props->hidden;
        op.screen_header_hide_back = props->hideBackButton;
      }
    } else if (op.component == "RNSScreen") {
      if (auto props = std::dynamic_pointer_cast<const RNSScreenProps>(
              shadowView.props)) {
        op.screen_activity_state = props->activityState;
        op.screen_stack_animation = toString(props->stackAnimation);
        op.screen_stack_presentation = toString(props->stackPresentation);
      }
    }
  };
  hooks.screensFrame = [](MountOp& op) {
    if (op.component == "RNSScreenStackHeaderConfig") {
      op.frame.h = op.screen_header_hidden ? 0.f : 56.f;
    } else if (op.component == "RNSScreenContentWrapper") {
      op.frame.y += 56.f;
      op.frame.h = std::max(0.f, op.frame.h - 56.f);
    }
  };
}

} // namespace rngpui
