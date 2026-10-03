#pragma once

#include <cstdint>

namespace gpui_safe_area {

struct Insets {
  double top;
  double right;
  double bottom;
  double left;
};

inline Insets gpui_safe_area_insets(int32_t /*surfaceId*/) {
  return {.top = 0.0, .right = 0.0, .bottom = 0.0, .left = 0.0};
}

} // namespace gpui_safe_area
