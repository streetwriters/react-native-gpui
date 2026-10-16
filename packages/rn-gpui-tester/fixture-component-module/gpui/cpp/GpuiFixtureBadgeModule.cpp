// The C++ half of the proof module. It registers the badge's props and a frame
// callback through the public API only; core's `GpuiModules.h` is the only
// header it needs beyond the Fabric props it reads.

#include <react/renderer/components/FixtureComponentModuleSpec/Props.h>

#include <folly/json.h>
#include <string>

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

void rn_gpui_install_fixture_badge_module() {
  registerComponentProps("FixtureBadge", badgePropsJson);
  registerFrameCallback(
      [](double timestampMs) { rn_gpui_fixture_badge_frame(timestampMs); });
  requestFrames("fixture-badge", true);
}

} // namespace rngpui
