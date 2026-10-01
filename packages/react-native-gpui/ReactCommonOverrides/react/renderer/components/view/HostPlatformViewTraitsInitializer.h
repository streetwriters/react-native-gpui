/*
 * React Native GPUI — platform view traits override (TODO 2.5).
 *
 * Upstream this header lives at
 * `packages/react-native/ReactCommon/react/renderer/components/view/platform/cxx/
 * react/renderer/components/view/HostPlatformViewTraitsInitializer.h` and is
 * included as `<react/renderer/components/view/HostPlatformViewTraitsInitializer.h>`.
 * `ReactCommonOverrides/` is on the include path ahead of that platform
 * directory, so this file replaces it. `react-native-platform-override
 * validate` tracks the copy through `packages/react-native-gpui/overrides.json`.
 *
 * Why: the upstream cxx implementation returns `false` from
 * `formsStackingContext()`, which lets Fabric flatten every View that does not
 * otherwise form a stacking context — its children are then mounted as
 * *siblings* of the View, with frames made absolute, by
 * `ReactCommon/react/renderer/mounting/internal/sliceChildShadowNodeViewPairs.cpp`.
 * That is invisible on the native platforms, because their pointer/hover event
 * routing reads the *shadow* tree (`PointerHoverTracker`, `PointerEventsProcessor`),
 * but this package builds its event path from the mounted view tree: hover
 * enter/leave and the `pointerEvents` ancestor walk would then miss the
 * flattened Views (a hover over a box's label never entered the box). Reporting
 * a stacking context for every View disables view flattening, so the mounted
 * tree mirrors the React tree — the same reason Android's platform traits report
 * `elevation != 0` and iOS has its own set.
 */

#pragma once

#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/ShadowNodeTraits.h>

namespace facebook::react::HostPlatformViewTraitsInitializer {

inline bool formsStackingContext(const ViewProps & /*props*/)
{
  return true;
}

inline bool formsView(const ViewProps & /*props*/)
{
  return false;
}

inline bool isKeyboardFocusable(const ViewProps & /*props*/)
{
  return false;
}

} // namespace facebook::react::HostPlatformViewTraitsInitializer
