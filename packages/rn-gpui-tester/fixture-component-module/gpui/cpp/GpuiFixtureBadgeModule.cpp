// The C++ half of the proof module. It registers the badge's props and a frame
// callback through the public API only; core's `GpuiModules.h` is the only
// header it needs beyond the Fabric props it reads.

#include <react/renderer/components/FixtureComponentModuleSpec/Props.h>

#include <folly/json.h>
#include <atomic>
#include <string>
#include <string_view>

#include "GpuiModules.h"

extern "C" void rn_gpui_fixture_badge_frame(double timestampMs);

namespace rngpui {
namespace {

std::string badgePropsJson(
    const std::string& /*componentName*/,
    const facebook::react::ShadowView& view) {
  if (!view.props) {
    return std::string("{}");
  }
  const auto& props =
      *std::static_pointer_cast<const facebook::react::FixtureBadgeProps>(
          view.props);
  folly::dynamic object = folly::dynamic::object;
  object["label"] = props.label;
  object["tickCount"] = props.tickCount;
  return folly::toJson(object);
}

} // namespace

namespace {
/// How many frames the fixture asks for after a badge appears. The test needs
/// the callback to be demonstrably live; a fixture that asked forever would
/// keep every app awake for its whole life, which the test driver reads as
/// "never idle" and every e2e would time out on.
constexpr int kFixtureFrameBudget = 60;
std::atomic<int> framesRemaining{0};
std::atomic<int> liveBadges{0};
} // namespace

void rn_gpui_install_fixture_badge_module() {
  registerComponentProps("FixtureBadge", badgePropsJson);
  registerFrameCallback([](double timestampMs) {
    if (framesRemaining.load() <= 0) {
      return;
    }
    rn_gpui_fixture_badge_frame(timestampMs);
    if (framesRemaining.fetch_sub(1) == 1) {
      // The budget is spent, so core may stop delivering frames.
      requestFrames("fixture-badge", false);
    }
  });
  registerMountObserver(extension::MountObserver{
      .onFrameChanged =
          [](facebook::react::SurfaceId,
             const facebook::react::ShadowView& view) {
            if (std::string_view(view.componentName) == "FixtureBadge") {
              liveBadges.fetch_add(1);
              framesRemaining.store(kFixtureFrameBudget);
              requestFrames("fixture-badge", true);
            }
          },
      .onDeleted =
          [](facebook::react::Tag) {
            // onDeleted carries no component name, so the budget is released
            // only when the last badge is gone. Asking per delete would stop
            // frames while a screen still shows one.
            if (liveBadges.fetch_sub(1) <= 1) {
              liveBadges.store(0);
              framesRemaining.store(0);
              requestFrames("fixture-badge", false);
            }
          },
      .afterBatch = nullptr});
}

} // namespace rngpui
