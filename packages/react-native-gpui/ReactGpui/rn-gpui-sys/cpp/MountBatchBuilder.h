// TODO 1.5 — design doc §18.8.
#pragma once

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (TODO 1.6, design doc §18.6)

#include <react/renderer/attributedstring/TextAttributes.h>
#include <react/renderer/graphics/Color.h>
#include <react/renderer/mounting/ShadowViewMutation.h>

#include <cstdint>
#include <string>

namespace rngpui {

// Flattens one Fabric mutation into the FFI-shaped MountOp (design doc §18.6).
MountOp buildMountOp(const facebook::react::ShadowViewMutation& mutation);

// Shared flattening helpers. The text measurement override (TODO 1.11, §18.9)
// reuses these so React and GPUI describe text identically.
uint32_t argb(const facebook::react::SharedColor& color);
TextFragmentFlat flattenTextFragment(const facebook::react::TextAttributes& attributes, const std::string& text);

} // namespace rngpui
