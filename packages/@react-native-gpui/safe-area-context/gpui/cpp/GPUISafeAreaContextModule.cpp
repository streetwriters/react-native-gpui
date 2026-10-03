#include <ReactCommon/TurboModule.h>
#include <react/coremodules/DeviceInfoModule.h>
#include "GPUISafeAreaInsets.h"

#include <memory>
#include <utility>

namespace {
facebook::jsi::Value getConstants(
    facebook::jsi::Runtime& runtime,
    facebook::react::TurboModule&,
    const facebook::jsi::Value*,
    size_t count) {
  if (count != 0) {
    throw facebook::jsi::JSError(
        runtime, "RNCSafeAreaContext.getConstants expects no arguments");
  }

  const auto windowSize = facebook::react::DeviceInfoModule::windowSize();
  facebook::jsi::Object insets(runtime);
  const auto safeInsets = gpui_safe_area::gpui_safe_area_insets(0);
  insets.setProperty(runtime, "top", safeInsets.top);
  insets.setProperty(runtime, "right", safeInsets.right);
  insets.setProperty(runtime, "bottom", safeInsets.bottom);
  insets.setProperty(runtime, "left", safeInsets.left);

  facebook::jsi::Object frame(runtime);
  frame.setProperty(runtime, "x", 0.0);
  frame.setProperty(runtime, "y", 0.0);
  frame.setProperty(runtime, "width", windowSize.width);
  frame.setProperty(runtime, "height", windowSize.height);

  facebook::jsi::Object metrics(runtime);
  metrics.setProperty(runtime, "insets", std::move(insets));
  metrics.setProperty(runtime, "frame", std::move(frame));

  facebook::jsi::Object constants(runtime);
  constants.setProperty(runtime, "initialWindowMetrics", std::move(metrics));
  return facebook::jsi::Value(std::move(constants));
}

class SafeAreaContextModule final : public facebook::react::TurboModule {
 public:
  explicit SafeAreaContextModule(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
      : TurboModule("RNCSafeAreaContext", std::move(jsInvoker)) {
    methodMap_.emplace("getConstants", MethodMetadata{0, &::getConstants});
  }
};
} // namespace

std::shared_ptr<facebook::react::TurboModule>
create_gpui_safe_area_context_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  if (name != "RNCSafeAreaContext") {
    return nullptr;
  }
  return std::make_shared<SafeAreaContextModule>(std::move(jsInvoker));
}
