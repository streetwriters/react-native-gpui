// TEMPORARY declarations for TODO 1.5.
//
// The real definitions of these types and functions come from the cxx bridge
// in rn-gpui-sys/src/lib.rs (design doc §18.6): cxx-build turns `include!`
// into a generated `rn-gpui-sys/src/lib.rs.h` during TODO 1.6.
//
// Until that bridge exists, the C++ glue needs the exact same flat,
// FFI-shaped types to compile against. This header mirrors them with std::
// types and is intentionally the ONLY place where the two representations can
// drift.
//
// TODO 1.6: delete this header, include "rn-gpui-sys/src/lib.rs.h", and drop
// the rn_gpui_log definition from GpuiHost.cpp.
#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace rngpui {

struct RectF {
  float x{0};
  float y{0};
  float w{0};
  float h{0};
};

struct EdgesF {
  float left{0};
  float top{0};
  float right{0};
  float bottom{0};
};

struct CornersF {
  float tl{0};
  float tr{0};
  float br{0};
  float bl{0};
};

struct ShadowF {
  float dx{0};
  float dy{0};
  float blur{0};
  float spread{0};
  uint32_t color{0}; // ARGB, premultiplied by nothing; straight alpha
  bool inset{false};
};

struct ViewPropsFlat {
  float opacity{1.0f};
  uint32_t background_color{0};
  EdgesF border_widths{};
  std::array<uint32_t, 4> border_colors{}; // left, top, right, bottom
  CornersF border_radii{};
  bool overflow_hidden{false};
  uint8_t pointer_events{0}; // 0 auto, 1 none, 2 box-none, 3 box-only
  std::vector<ShadowF> shadows{};
  std::array<float, 16> transform{}; // column-major 4x4, unused until TODO 2.x
  bool has_transform{false};
  std::string test_id{};
  std::string accessibility_label{};
  std::string accessibility_role{};
};

struct TextFragmentFlat {
  std::string text{};
  std::string font_family{};
  float font_size{14.0f};
  uint16_t font_weight{400};
  bool italic{false};
  uint32_t color{0};
  float line_height{0.0f}; // 0 = let the layout engine decide
  float letter_spacing{0.0f};
  bool underline{false};
  bool strikethrough{false};
};

struct ParagraphFlat {
  std::vector<TextFragmentFlat> fragments{};
  int32_t max_lines{0}; // 0 = unlimited
  uint8_t text_align{0}; // 0 natural, 1 left, 2 center, 3 right, 4 justified, 5 start, 6 end
  uint8_t ellipsize{0}; // 0 tail, 1 head, 2 middle, 3 clip
};

enum class MountKind : uint8_t {
  Create = 1,
  Delete = 2,
  Insert = 4,
  Remove = 8,
  Update = 16,
};

struct MountOp {
  MountKind kind{MountKind::Create};
  int32_t tag{0};
  int32_t parent_tag{-1};
  int32_t index{-1};
  std::string component{};
  RectF frame{};
  bool props_changed{false};
  ViewPropsFlat view{};
  bool has_paragraph{false};
  ParagraphFlat paragraph{};
  std::string image_uri{};
};

struct MountBatch {
  int32_t surface_id{0};
  std::vector<MountOp> ops{};
};

struct MeasureResult {
  float width{0};
  float height{0};
};

// Implemented in GpuiHost.cpp for now: logs to stderr. The real
// implementation is Rust-side (`log` crate) and arrives with the bridge.
void rn_gpui_log(int32_t level, const std::string& message);

// Not called yet — executeMount() in GpuiMountingManager.cpp is logging-only
// until TODO 1.6 registers the Rust mount handler.
void rn_gpui_on_mount(MountBatch batch);
MeasureResult rn_gpui_measure_text(const ParagraphFlat& paragraph, float max_width, float max_height);

} // namespace rngpui
