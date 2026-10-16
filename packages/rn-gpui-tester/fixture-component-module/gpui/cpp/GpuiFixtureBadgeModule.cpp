
#include <react/renderer/components/FixtureComponentModuleSpec/Props.h>

#include <folly/json.h>
#include <atomic>
#include <string>
#include <string_view>

#include "GpuiModules.h"

extern "C" void rn_gpui_fixture_badge_frame(double timestampMs);
#if defined(_MSC_VER)
extern "C" void rn_gpui_fixture_badge_frame_default(double) {}
#pragma comment( \
    linker,      \
    "/alternatename:rn_gpui_fixture_badge_frame=rn_gpui_fixture_badge_frame_default")
#endif

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
            if (liveBadges.fetch_sub(1) <= 1) {
              liveBadges.store(0);
              framesRemaining.store(0);
              requestFrames("fixture-badge", false);
            }
          },
      .afterBatch = nullptr});
}

} // namespace rngpui
